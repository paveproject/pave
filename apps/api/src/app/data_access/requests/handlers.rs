use super::dto::{
    DataAccessRequestApproveRequest, DataAccessRequestContactResponse, DataAccessRequestResponse,
    DataAccessRequestShareItem, DataAccessState,
};
use crate::app::me::dto::MeProfile;
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::app::trusted_contacts::handlers::profiles_for;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::{Duration, Utc};
use db_rs::sea_orm_active_enums::{
    DataAccessRequestContactStatusEnum, DataAccessRequestStatusEnum, DeviceStatusEnum,
    TrustedContactStatusEnum,
};
use db_rs::{data_access_request, data_access_request_contact, device, trusted_contact};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, EntityTrait,
    IntoActiveModel, QueryFilter,
};
use uuid::Uuid;

/// A strict majority of the owner's *other* accepted contacts.
///
/// **Not** the client's Shamir threshold, which counts *all* contacts - the
/// server is never told that one. The requester's own share makes up the
/// difference; see the invariant test below.
///
/// Zero others returns zero: with a single contact there is no quorum to form
/// and the owner's veto window is the only gate.
pub(crate) fn required_approvals(other_contacts: usize) -> i32 {
    if other_contacts == 0 {
        0
    } else {
        (other_contacts / 2 + 1) as i32
    }
}

pub(crate) fn tally(rows: &[data_access_request_contact::Model]) -> (i32, i32) {
    let approved = rows
        .iter()
        .filter(|row| row.status == DataAccessRequestContactStatusEnum::Approved)
        .count() as i32;
    let declined = rows
        .iter()
        .filter(|row| row.status == DataAccessRequestContactStatusEnum::Declined)
        .count() as i32;
    (approved, declined)
}

/// Whether enough contacts have declined that no quorum can ever be reached.
fn is_unreachable(rows: &[data_access_request_contact::Model]) -> bool {
    let (approved, declined) = tally(rows);
    let required = required_approvals(rows.len());
    required > 0 && approved + (rows.len() as i32 - approved - declined) < required
}

/// Order matters: a stored terminal status outranks the clock, and an expiry
/// outranks an otherwise-open grant.
pub(crate) fn access_state(
    request: &data_access_request::Model,
    approved: i32,
    required: i32,
) -> DataAccessState {
    match request.status {
        DataAccessRequestStatusEnum::Refused => return DataAccessState::Refused,
        DataAccessRequestStatusEnum::Failed => return DataAccessState::Failed,
        DataAccessRequestStatusEnum::Cancelled => return DataAccessState::Cancelled,
        DataAccessRequestStatusEnum::Expired => return DataAccessState::Expired,
        DataAccessRequestStatusEnum::Pending => {}
    }

    let now = Utc::now();
    if now >= request.expires_at {
        return DataAccessState::Expired;
    }
    if approved >= required && now >= request.release_at {
        DataAccessState::Open
    } else {
        DataAccessState::Waiting
    }
}

/// How long access stays open once it does, so a grant lapses on its own.
pub(crate) const ACCESS_WINDOW_DAYS: i64 = 7;

/// Writes `expired` onto a `pending` row whose window has closed.
///
/// Reads never need this - `access_state` derives `Expired` from the clock.
/// `idx_data_access_request_one_pending_per_pair` does: a partial index
/// predicate must be immutable, so it can only key off the stored status, and
/// an elapsed request left `pending` held the pair's only slot for good.
pub(crate) async fn close_if_expired(
    db: &DatabaseConnection,
    request: data_access_request::Model,
) -> data_access_request::Model {
    if request.status != DataAccessRequestStatusEnum::Pending || Utc::now() < request.expires_at {
        return request;
    }

    let mut active = request.into_active_model();
    active.status = Set(DataAccessRequestStatusEnum::Expired);
    active
        .update(db)
        .await
        .expect("failed to close an expired data access request")
}

pub(crate) async fn load_contact_rows(
    db: &DatabaseConnection,
    request_id: Uuid,
) -> Vec<data_access_request_contact::Model> {
    data_access_request_contact::Entity::find()
        .filter(data_access_request_contact::Column::DataAccessRequestId.eq(request_id))
        .all(db)
        .await
        .expect("failed to query data access request contacts")
}

pub(crate) async fn to_response(
    state: &AppState,
    request: data_access_request::Model,
    rows: &[data_access_request_contact::Model],
) -> DataAccessRequestResponse {
    let (approved, declined) = tally(rows);
    let required = required_approvals(rows.len());
    let access = access_state(&request, approved, required);

    let profiles = profiles_for(
        &state.db,
        vec![
            request.owner_user_id.clone(),
            request.requester_user_id.clone(),
        ],
        &state.config,
    )
    .await;
    let profile_of = |id: &str| {
        profiles.get(id).cloned().unwrap_or(MeProfile {
            id: id.to_string(),
            username: String::new(),
            image: None,
            devices: Vec::new(),
        })
    };

    DataAccessRequestResponse {
        id: request.id.to_string(),
        status: request.status.into(),
        access,
        owner: profile_of(&request.owner_user_id),
        requester: profile_of(&request.requester_user_id),
        release_at: request.release_at.to_rfc3339(),
        expires_at: request.expires_at.to_rfc3339(),
        created_at: request.created_at.to_rfc3339(),
        refused_at: request.refused_at.map(|at| at.to_rfc3339()),
        failed_at: request.failed_at.map(|at| at.to_rfc3339()),
        cancelled_at: request.cancelled_at.map(|at| at.to_rfc3339()),
        total_contacts: rows.len() as i32,
        approved_contacts: approved,
        declined_contacts: declined,
        required_approvals: required,
    }
}

/// The question `access.rs` asks on every read route.
pub(crate) async fn has_open_access(
    db: &DatabaseConnection,
    owner_user_id: &str,
    caller_user_id: &str,
) -> bool {
    let Ok(Some(request)) = data_access_request::Entity::find()
        .filter(data_access_request::Column::OwnerUserId.eq(owner_user_id.to_string()))
        .filter(data_access_request::Column::RequesterUserId.eq(caller_user_id.to_string()))
        .filter(data_access_request::Column::Status.eq(DataAccessRequestStatusEnum::Pending))
        .one(db)
        .await
    else {
        return false;
    };

    let rows = load_contact_rows(db, request.id).await;
    let (approved, _) = tally(&rows);
    access_state(&request, approved, required_approvals(rows.len())) == DataAccessState::Open
}

/// Visible to the two parties and nobody else.
async fn find_request_for_party(
    db: &DatabaseConnection,
    id: Uuid,
    caller_user_id: &str,
) -> Option<data_access_request::Model> {
    let request = data_access_request::Entity::find_by_id(id)
        .one(db)
        .await
        .expect("failed to query data access request")?;

    (request.owner_user_id == caller_user_id || request.requester_user_id == caller_user_id)
        .then_some(request)
}

/// The asked contact's own row, via the `trusted_contact` relationship.
async fn find_contact_row(
    db: &DatabaseConnection,
    id: Uuid,
    caller_user_id: &str,
) -> Option<(
    data_access_request::Model,
    data_access_request_contact::Model,
)> {
    let request = data_access_request::Entity::find_by_id(id)
        .one(db)
        .await
        .expect("failed to query data access request")?;

    let rows = load_contact_rows(db, request.id).await;
    let contacts = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::Id.is_in(rows.iter().map(|row| row.trusted_contact_id)))
        .all(db)
        .await
        .expect("failed to query trusted contacts");

    let mine = contacts
        .into_iter()
        .find(|contact| contact.contact_user_id.as_deref() == Some(caller_user_id))?;
    let row = rows
        .into_iter()
        .find(|row| row.trusted_contact_id == mine.id)?;

    Some((request, row))
}

async fn requesting_device_public_key(db: &DatabaseConnection, device_id: Uuid) -> Option<String> {
    device::Entity::find_by_id(device_id)
        .one(db)
        .await
        .expect("failed to query the requesting device")
        .map(|row| row.public_key)
}

pub(crate) async fn to_contact_response(
    state: &AppState,
    request: &data_access_request::Model,
    row: data_access_request_contact::Model,
) -> Option<DataAccessRequestContactResponse> {
    let public_key = requesting_device_public_key(&state.db, request.requesting_device_id).await?;
    let profiles = profiles_for(
        &state.db,
        vec![
            request.owner_user_id.clone(),
            request.requester_user_id.clone(),
        ],
        &state.config,
    )
    .await;
    let profile_of = |id: &str| {
        profiles.get(id).cloned().unwrap_or(MeProfile {
            id: id.to_string(),
            username: String::new(),
            image: None,
            devices: Vec::new(),
        })
    };

    Some(DataAccessRequestContactResponse {
        id: row.id.to_string(),
        data_access_request_id: request.id.to_string(),
        status: row.status.into(),
        owner: profile_of(&request.owner_user_id),
        requester: profile_of(&request.requester_user_id),
        requesting_device_public_key: public_key,
        created_at: row.created_at.to_rfc3339(),
    })
}

/// Every accepted contact of `owner_user_id` except the requester.
pub(crate) async fn other_accepted_contacts(
    db: &DatabaseConnection,
    owner_user_id: &str,
    exclude_user_id: &str,
) -> Vec<trusted_contact::Model> {
    trusted_contact::Entity::find()
        .filter(trusted_contact::Column::OwnerUserId.eq(owner_user_id.to_string()))
        .filter(trusted_contact::Column::Status.eq(TrustedContactStatusEnum::Accepted))
        .all(db)
        .await
        .expect("failed to query accepted trusted contacts")
        .into_iter()
        .filter(|contact| contact.contact_user_id.as_deref() != Some(exclude_user_id))
        .collect()
}

/// The caller's own `active` device, which approvals re-seal shares to.
pub(crate) async fn resolve_requesting_device(
    db: &DatabaseConnection,
    user_id: &str,
    session_id: &str,
) -> Option<device::Model> {
    device::Entity::find()
        .filter(device::Column::UserId.eq(user_id.to_string()))
        .filter(device::Column::SessionId.eq(session_id.to_string()))
        .filter(device::Column::Status.eq(DeviceStatusEnum::Active))
        .one(db)
        .await
        .expect("failed to query the caller's device")
}

/// The user ids of every contact asked - the rows only hold a
/// `trusted_contact` id, and fanning events out needs user ids.
pub(crate) async fn asked_contact_user_ids(
    db: &DatabaseConnection,
    rows: &[data_access_request_contact::Model],
) -> Vec<String> {
    if rows.is_empty() {
        return Vec::new();
    }
    trusted_contact::Entity::find()
        .filter(trusted_contact::Column::Id.is_in(rows.iter().map(|row| row.trusted_contact_id)))
        .all(db)
        .await
        .expect("failed to query the asked trusted contacts")
        .into_iter()
        .filter_map(|contact| contact.contact_user_id)
        .collect()
}

/// Re-reads the row before fanning out: every caller has just written to it,
/// and clients merge this payload straight into their cache.
pub(crate) async fn publish_request_event(
    state: &AppState,
    request_id: Uuid,
    include_contacts: bool,
    build: impl Fn(DataAccessRequestResponse) -> MeEventsUserEvent,
) {
    let Ok(Some(fresh)) = data_access_request::Entity::find_by_id(request_id)
        .one(&state.db)
        .await
    else {
        return;
    };
    let rows = load_contact_rows(&state.db, request_id).await;
    let owner_user_id = fresh.owner_user_id.clone();
    let requester_user_id = fresh.requester_user_id.clone();
    let contact_ids = if include_contacts {
        asked_contact_user_ids(&state.db, &rows).await
    } else {
        Vec::new()
    };

    let response = to_response(state, fresh, &rows).await;
    for user_id in [owner_user_id, requester_user_id]
        .into_iter()
        .chain(contact_ids)
    {
        state
            .user_events_hub
            .publish(user_id, build(response.clone()));
    }
}

// ---------------------------------------------------------------------------
// item routes
// ---------------------------------------------------------------------------

/// A contact approves by re-sealing their own share to the requesting device.
/// Not a vote: without the envelope there is nothing to combine.
#[utoipa::path(
    post,
    path = "/data-access/request/{data_access_request_id}/approve",
    tag = "DataAccessRequests",
    params(("data_access_request_id" = Uuid, Path, description = "Request id")),
    request_body = DataAccessRequestApproveRequest,
    responses(
        (status = 200, description = "Approved", body = DataAccessRequestContactResponse),
        (status = 404, description = "Not found, or not yours to approve"),
        (status = 409, description = "Already resolved")
    )
)]
pub async fn approve_data_access_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
    Json(body): Json<DataAccessRequestApproveRequest>,
) -> impl IntoResponse {
    let Some((request, row)) = find_contact_row(&state.db, id, &session.user.id).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if request.status != DataAccessRequestStatusEnum::Pending {
        return (StatusCode::CONFLICT, "this request is already resolved").into_response();
    }

    let now = Utc::now();
    let mut active = row.into_active_model();
    active.status = Set(DataAccessRequestContactStatusEnum::Approved);
    active.encrypted_share = Set(Some(body.encrypted_share));
    active.responded_at = Set(Some(now.into()));
    let updated = active
        .update(&state.db)
        .await
        .expect("failed to approve the data access request");

    // If this approval completes the quorum after the delay already elapsed,
    // access opens now, not at `release_at` - so the window is re-based onto
    // this instant, or a slow quorum would eat most of it. A quorum reached
    // early opens at `release_at`, which creation already measured from.
    let rows = load_contact_rows(&state.db, request.id).await;
    let (approved, _) = tally(&rows);
    let required = required_approvals(rows.len());
    if approved == required && now > request.release_at {
        let mut active = request.clone().into_active_model();
        active.expires_at = Set((now + Duration::days(ACCESS_WINDOW_DAYS)).into());
        active
            .update(&state.db)
            .await
            .expect("failed to re-base the access window");
    }

    publish_request_event(&state, request.id, false, |response| {
        MeEventsUserEvent::DataAccessRequestUpdated(response)
    })
    .await;

    match to_contact_response(&state, &request, updated).await {
        Some(response) => Json(response).into_response(),
        None => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "the requesting device is gone",
        )
            .into_response(),
    }
}

#[utoipa::path(
    post,
    path = "/data-access/request/{data_access_request_id}/decline",
    tag = "DataAccessRequests",
    params(("data_access_request_id" = Uuid, Path, description = "Request id")),
    responses(
        (status = 200, description = "Declined", body = DataAccessRequestContactResponse),
        (status = 404, description = "Not found, or not yours to decline"),
        (status = 409, description = "Already resolved")
    )
)]
pub async fn decline_data_access_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let Some((request, row)) = find_contact_row(&state.db, id, &session.user.id).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if request.status != DataAccessRequestStatusEnum::Pending {
        return (StatusCode::CONFLICT, "this request is already resolved").into_response();
    }

    let mut active = row.into_active_model();
    active.status = Set(DataAccessRequestContactStatusEnum::Declined);
    active.responded_at = Set(Some(Utc::now().into()));
    let updated = active
        .update(&state.db)
        .await
        .expect("failed to decline the data access request");

    // Say so rather than leave the requester watching a counter that can
    // never move.
    let rows = load_contact_rows(&state.db, request.id).await;
    let failed = is_unreachable(&rows);
    let request = if failed {
        let mut active = request.clone().into_active_model();
        active.status = Set(DataAccessRequestStatusEnum::Failed);
        active.failed_at = Set(Some(Utc::now().into()));
        active
            .update(&state.db)
            .await
            .expect("failed to mark the data access request failed")
    } else {
        request
    };

    // A dead end is a closure: it has to clear every inbox it sits in.
    if failed {
        publish_request_event(&state, request.id, true, |response| {
            MeEventsUserEvent::DataAccessRequestClosed(response)
        })
        .await;
    } else {
        publish_request_event(&state, request.id, false, |response| {
            MeEventsUserEvent::DataAccessRequestUpdated(response)
        })
        .await;
    }

    match to_contact_response(&state, &request, updated).await {
        Some(response) => Json(response).into_response(),
        None => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "the requesting device is gone",
        )
            .into_response(),
    }
}

/// The owner's veto. Works during the delay **and** after access opened.
#[utoipa::path(
    post,
    path = "/data-access/request/{data_access_request_id}/refuse",
    tag = "DataAccessRequests",
    params(("data_access_request_id" = Uuid, Path, description = "Request id")),
    responses(
        (status = 200, description = "Refused", body = DataAccessRequestResponse),
        (status = 404, description = "Not found, or not your account's request")
    )
)]
pub async fn refuse_data_access_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let Some(request) = data_access_request::Entity::find_by_id(id)
        .filter(data_access_request::Column::OwnerUserId.eq(session.user.id.clone()))
        .filter(data_access_request::Column::Status.eq(DataAccessRequestStatusEnum::Pending))
        .one(&state.db)
        .await
        .expect("failed to query the data access request")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mut active = request.into_active_model();
    active.status = Set(DataAccessRequestStatusEnum::Refused);
    active.refused_at = Set(Some(Utc::now().into()));
    let refused = active
        .update(&state.db)
        .await
        .expect("failed to refuse the data access request");

    publish_request_event(&state, refused.id, true, |response| {
        MeEventsUserEvent::DataAccessRequestClosed(response)
    })
    .await;

    let rows = load_contact_rows(&state.db, refused.id).await;
    Json(to_response(&state, refused, &rows).await).into_response()
}

/// The requester withdrawing their own request. Its own state rather than
/// `refused`: an owner declining is a signal worth keeping, this is not.
#[utoipa::path(
    post,
    path = "/data-access/request/{data_access_request_id}/cancel",
    tag = "DataAccessRequests",
    params(("data_access_request_id" = Uuid, Path, description = "Request id")),
    responses(
        (status = 200, description = "Cancelled", body = DataAccessRequestResponse),
        (status = 404, description = "Not found, or not your request to cancel")
    )
)]
pub async fn cancel_data_access_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let Some(request) = data_access_request::Entity::find_by_id(id)
        .filter(data_access_request::Column::RequesterUserId.eq(session.user.id.clone()))
        .filter(data_access_request::Column::Status.eq(DataAccessRequestStatusEnum::Pending))
        .one(&state.db)
        .await
        .expect("failed to query the data access request")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mut active = request.into_active_model();
    active.status = Set(DataAccessRequestStatusEnum::Cancelled);
    active.cancelled_at = Set(Some(Utc::now().into()));
    let cancelled = active
        .update(&state.db)
        .await
        .expect("failed to cancel the data access request");

    // Clears every asked contact's inbox too - a withdrawn request must not
    // sit there asking for a decision.
    publish_request_event(&state, cancelled.id, true, |response| {
        MeEventsUserEvent::DataAccessRequestClosed(response)
    })
    .await;

    let rows = load_contact_rows(&state.db, cancelled.id).await;
    Json(to_response(&state, cancelled, &rows).await).into_response()
}

/// The re-sealed shares, for the requester to combine on their own device.
/// 423 until access is `open`: the delay is enforced here, not only in the UI.
#[utoipa::path(
    get,
    path = "/data-access/request/{data_access_request_id}/shares",
    tag = "DataAccessRequests",
    params(("data_access_request_id" = Uuid, Path, description = "Request id")),
    responses(
        (status = 200, description = "Sealed shares", body = Vec<DataAccessRequestShareItem>),
        (status = 404, description = "Not found, or not your request"),
        (status = 423, description = "Access is not open: still waiting, refused, failed or expired")
    )
)]
pub async fn list_data_access_request_shares(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let Some(request) = data_access_request::Entity::find_by_id(id)
        .filter(data_access_request::Column::RequesterUserId.eq(session.user.id.clone()))
        .one(&state.db)
        .await
        .expect("failed to query the data access request")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let rows = load_contact_rows(&state.db, request.id).await;
    let (approved, _) = tally(&rows);
    if access_state(&request, approved, required_approvals(rows.len())) != DataAccessState::Open {
        return (StatusCode::LOCKED, "access is not open").into_response();
    }

    let shares = rows
        .into_iter()
        .filter_map(|row| row.encrypted_share)
        .map(|encrypted_share| DataAccessRequestShareItem { encrypted_share })
        .collect::<Vec<_>>();
    Json(shares).into_response()
}

/// Readable by both parties.
#[utoipa::path(
    get,
    path = "/data-access/request/{data_access_request_id}",
    tag = "DataAccessRequests",
    params(("data_access_request_id" = Uuid, Path, description = "Request id")),
    responses(
        (status = 200, description = "The request", body = DataAccessRequestResponse),
        (status = 404, description = "Not found, or you are not a party to it")
    )
)]
pub async fn get_data_access_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let Some(request) = find_request_for_party(&state.db, id, &session.user.id).await else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let rows = load_contact_rows(&state.db, request.id).await;
    Json(to_response(&state, request, &rows).await).into_response()
}

#[cfg(test)]
mod tests {
    use super::required_approvals;

    /// The client's rule, mirrored from
    /// `apps/mobile/src/lib/recoveryKey/index.ts` (`const threshold = ...`).
    /// Duplicated on purpose: the server must never be *told* the Shamir
    /// threshold - it would then be a thing an attacker could ask it for - so
    /// the only way to check the two agree is to restate one of them here.
    fn client_shamir_threshold(contacts: usize) -> usize {
        if contacts == 1 {
            1
        } else {
            std::cmp::max(2, contacts.div_ceil(2))
        }
    }

    /// The quorum this server asks for, **plus the requester's own share**,
    /// has to reach the client's threshold. The `+ 1` is the share the
    /// requester holds for being a contact themselves: the server never asks
    /// for it, so the reader adds it back in (see `useOwnerDataAccess`).
    /// Without it, one and two contacts come out short and nothing decrypts.
    #[test]
    fn the_quorum_plus_your_own_share_always_reaches_the_threshold() {
        for contacts in 1..=12usize {
            let asked = required_approvals(contacts - 1) as usize;
            let available = asked + 1;
            let threshold = client_shamir_threshold(contacts);

            assert!(
                available >= threshold,
                "{contacts} contacts: {asked} approvals asked + 1 own = {available}, \
                 threshold {threshold}"
            );
        }
    }

    /// The server never asks more of the others than there are others.
    #[test]
    fn the_quorum_never_exceeds_the_contacts_it_asks() {
        for others in 0..=12usize {
            assert!(required_approvals(others) as usize <= others.max(1));
        }
    }
}
