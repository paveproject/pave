use super::dto::{
    MeRecoveryRequestsApproveRequest, MeRecoveryRequestsContactResponse,
    MeRecoveryRequestsResponse, MeRecoveryRequestsShareItem,
};
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::app::trusted_contacts::handlers::{device_summaries_for, profiles_for};
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::Utc;
use db_rs::device;
use db_rs::recovery_request;
use db_rs::recovery_request_contact;
use db_rs::sea_orm_active_enums::{
    DeviceStatusEnum, RecoveryRequestContactStatusEnum, RecoveryRequestStatusEnum,
};
use db_rs::trusted_contact;
use notify_contracts::{NotifyJob, PushContent, PushNotifyPayload, PushTarget};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
};
use std::collections::HashMap;
use uuid::Uuid;

pub(crate) fn to_recovery_request_response(
    model: recovery_request::Model,
    total_contacts: i32,
    approved_contacts: i32,
    declined_contacts: i32,
) -> MeRecoveryRequestsResponse {
    MeRecoveryRequestsResponse {
        id: model.id.to_string(),
        status: model.status.into(),
        release_at: model.release_at.to_rfc3339(),
        created_at: model.created_at.to_rfc3339(),
        completed_at: model.completed_at.map(|t| t.to_rfc3339()),
        cancelled_at: model.cancelled_at.map(|t| t.to_rfc3339()),
        failed_at: model.failed_at.map(|t| t.to_rfc3339()),
        total_contacts,
        approved_contacts,
        declined_contacts,
    }
}

pub(crate) async fn fetch_contact_rows(
    db: &sea_orm::DatabaseConnection,
    recovery_request_id: Uuid,
) -> Vec<recovery_request_contact::Model> {
    recovery_request_contact::Entity::find()
        .filter(recovery_request_contact::Column::RecoveryRequestId.eq(recovery_request_id))
        .all(db)
        .await
        .expect("failed to query recovery request contact rows")
}

pub(crate) fn tally(rows: &[recovery_request_contact::Model]) -> (i32, i32, i32) {
    let total = rows.len() as i32;
    let approved = rows
        .iter()
        .filter(|r| r.status == RecoveryRequestContactStatusEnum::Approved)
        .count() as i32;
    let declined = rows
        .iter()
        .filter(|r| r.status == RecoveryRequestContactStatusEnum::Declined)
        .count() as i32;
    (total, approved, declined)
}

/// True once every asked contact has responded and none approved - the
/// *only* failure condition the server can detect without ever being told
/// the Shamir threshold (that only ever lives inside each sealed
/// envelope): a threshold is always at least one, so zero approvals can
/// never be enough no matter what it is. Anything short of that (a
/// contact or two still pending, or at least one approval already in)
/// might still succeed, and the server has no way to know.
fn is_unrecoverable(rows: &[recovery_request_contact::Model]) -> bool {
    let still_pending = rows
        .iter()
        .any(|r| r.status == RecoveryRequestContactStatusEnum::Pending);
    let any_approved = rows
        .iter()
        .any(|r| r.status == RecoveryRequestContactStatusEnum::Approved);
    !still_pending && !any_approved
}

async fn mark_failed(
    db: &sea_orm::DatabaseConnection,
    request_id: Uuid,
) -> Option<recovery_request::Model> {
    let model = recovery_request::Entity::find_by_id(request_id)
        .filter(recovery_request::Column::Status.eq(RecoveryRequestStatusEnum::Pending))
        .one(db)
        .await
        .expect("failed to query recovery request")?;

    let mut active = model.into_active_model();
    active.status = Set(RecoveryRequestStatusEnum::Failed);
    active.failed_at = Set(Some(Utc::now().into()));
    active.updated_at = Set(Utc::now().into());
    Some(
        active
            .update(db)
            .await
            .expect("failed to mark recovery request failed"),
    )
}

/// Still blind sealed blobs - refused outright until `releaseAt` passes,
/// regardless of how many contacts have already approved.
#[utoipa::path(
    get,
    path = "/recovery-request/{recovery_request_id}/shares",
    tag = "RecoveryRequests",
    params(("recovery_request_id" = Uuid, Path, description = "Recovery request id")),
    responses(
        (status = 200, description = "Sealed shares collected so far", body = Vec<MeRecoveryRequestsShareItem>),
        (status = 404, description = "Not found, or not yours"),
        (status = 423, description = "Still within the mandatory delay window")
    )
)]
pub async fn list_recovery_request_shares(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let Some(request) = recovery_request::Entity::find_by_id(id)
        .filter(recovery_request::Column::OwnerUserId.eq(session.user.id))
        .one(&state.db)
        .await
        .expect("failed to query recovery request")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    if Utc::now() < request.release_at {
        return (
            StatusCode::LOCKED,
            "still within the mandatory delay window",
        )
            .into_response();
    }

    let shares = recovery_request_contact::Entity::find()
        .filter(recovery_request_contact::Column::RecoveryRequestId.eq(id))
        .filter(
            recovery_request_contact::Column::Status.eq(RecoveryRequestContactStatusEnum::Approved),
        )
        .all(&state.db)
        .await
        .expect("failed to query recovery request shares")
        .into_iter()
        .filter_map(|row| {
            row.encrypted_share
                .map(|encrypted_share| MeRecoveryRequestsShareItem {
                    trusted_contact_id: row.trusted_contact_id.to_string(),
                    encrypted_share,
                })
        })
        .collect::<Vec<_>>();

    Json(shares).into_response()
}

#[utoipa::path(
    delete,
    path = "/recovery-request/{recovery_request_id}",
    tag = "RecoveryRequests",
    params(("recovery_request_id" = Uuid, Path, description = "Recovery request id")),
    responses(
        (status = 200, description = "Cancelled"),
        (status = 404, description = "Not found, not yours, or already resolved")
    )
)]
pub async fn cancel_recovery_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    // Independent of each other - resolved concurrently.
    let (model, contact_rows, owner_devices) = tokio::join!(
        recovery_request::Entity::find_by_id(id)
            .filter(recovery_request::Column::OwnerUserId.eq(session.user.id.clone()))
            .filter(recovery_request::Column::Status.eq(RecoveryRequestStatusEnum::Pending))
            .one(&state.db),
        recovery_request_contact::Entity::find()
            .filter(recovery_request_contact::Column::RecoveryRequestId.eq(id))
            .all(&state.db),
        device_summaries_for(&state.db, &session.user.id),
    );
    let Some(model) = model.expect("failed to query recovery request") else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let contact_rows = contact_rows.expect("failed to query recovery request contacts");
    let owner_user_id = session.user.id.clone();

    let owner_profile = crate::app::me::dto::MeProfile {
        id: session.user.id,
        username: session
            .user
            .display_username
            .expect("display_username is NOT NULL in db"),
        image: crate::libs::media::resolve_media_url(
            session.user.image.as_deref(),
            crate::libs::media::AVATARS_FOLDER,
            &state.config,
        ),
        devices: owner_devices,
    };

    cancel_recovery_request_model(&state, model, contact_rows, owner_user_id, owner_profile).await;

    StatusCode::OK.into_response()
}

/// Shared by the handler above and
/// `recovery_key_mnemonic::handlers::activate_via_recovery_key_mnemonic`
/// (which cancels any in-flight trusted-contacts request the same way,
/// so completing recovery through one path never leaves the other
/// dangling) - everything past "the pending request + its contact rows
/// are already resolved and the owner's profile already built."
pub(crate) async fn cancel_recovery_request_model(
    state: &AppState,
    model: recovery_request::Model,
    contact_rows: Vec<recovery_request_contact::Model>,
    owner_user_id: String,
    owner_profile: crate::app::me::dto::MeProfile,
) {
    let id = model.id;
    let requesting_device_id = model.requesting_device_id;

    let mut active = model.into_active_model();
    active.status = Set(RecoveryRequestStatusEnum::Cancelled);
    active.cancelled_at = Set(Some(Utc::now().into()));
    active.updated_at = Set(Utc::now().into());

    // Independent of the update itself and of each other - resolved
    // concurrently with it. Restoring the suspended devices is a best-
    // effort reversal, not a security boundary (unlike suspending them in
    // the first place) - they stay revoked as sessions regardless, and
    // simply re-register (and re-sync the DEK) the normal way next launch.
    let (update_result, requesting_device, trusted_contacts, restore_result) = tokio::join!(
        active.update(&state.db),
        device::Entity::find_by_id(requesting_device_id).one(&state.db),
        trusted_contact::Entity::find()
            .filter(
                trusted_contact::Column::Id
                    .is_in(contact_rows.iter().map(|r| r.trusted_contact_id)),
            )
            .all(&state.db),
        device::Entity::update_many()
            .col_expr(
                device::Column::Status,
                sea_orm::sea_query::Expr::value(DeviceStatusEnum::Active),
            )
            .col_expr(
                device::Column::UpdatedAt,
                sea_orm::sea_query::Expr::value(Utc::now()),
            )
            .filter(device::Column::UserId.eq(owner_user_id))
            .filter(device::Column::Status.eq(DeviceStatusEnum::Suspended))
            .exec(&state.db),
    );
    update_result.expect("failed to cancel recovery request");
    restore_result.expect("failed to restore suspended devices after cancellation");
    let requesting_device_public_key = requesting_device
        .expect("failed to query requesting device")
        .map(|d| d.public_key)
        .unwrap_or_default();
    let trusted_contacts: HashMap<Uuid, trusted_contact::Model> = trusted_contacts
        .expect("failed to query trusted contacts for cancellation notice")
        .into_iter()
        .map(|row| (row.id, row))
        .collect();

    for row in contact_rows {
        let Some(contact) = trusted_contacts.get(&row.trusted_contact_id) else {
            continue;
        };
        let Some(contact_user_id) = contact.contact_user_id.clone() else {
            continue;
        };
        state.user_events_hub.publish(
            contact_user_id,
            MeEventsUserEvent::RecoveryRequestCancelled(MeRecoveryRequestsContactResponse {
                id: row.id.to_string(),
                recovery_request_id: id.to_string(),
                status: row.status.into(),
                owner: owner_profile.clone(),
                requesting_device_public_key: requesting_device_public_key.clone(),
                created_at: row.created_at.to_rfc3339(),
            }),
        );
    }
}

/// Called once the requesting device has locally combined enough shares
/// into the recovered DEK.
#[utoipa::path(
    post,
    path = "/recovery-request/{recovery_request_id}/complete",
    tag = "RecoveryRequests",
    params(("recovery_request_id" = Uuid, Path, description = "Recovery request id")),
    responses(
        (status = 200, description = "Marked completed", body = MeRecoveryRequestsResponse),
        (status = 404, description = "Not found, not yours, or already resolved")
    )
)]
pub async fn complete_recovery_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let Some(model) = recovery_request::Entity::find_by_id(id)
        .filter(recovery_request::Column::OwnerUserId.eq(session.user.id))
        .filter(recovery_request::Column::Status.eq(RecoveryRequestStatusEnum::Pending))
        .one(&state.db)
        .await
        .expect("failed to query recovery request")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    // Independent of each other - resolved concurrently.
    let (rows, device_row) = tokio::join!(
        fetch_contact_rows(&state.db, model.id),
        device::Entity::find_by_id(model.requesting_device_id).one(&state.db),
    );
    let (total, approved, declined) = tally(&rows);
    let device_row = device_row.expect("failed to query requesting device");

    let mut active = model.into_active_model();
    active.status = Set(RecoveryRequestStatusEnum::Completed);
    active.completed_at = Set(Some(Utc::now().into()));
    active.updated_at = Set(Utc::now().into());

    // The requesting device just reconstructed the DEK client-side - it
    // needs to become `active` too, not just have the request marked
    // resolved. Always exactly one row (the lone survivor of
    // `create_recovery_request`'s device wipe). Independent of
    // completing the request itself, so done concurrently with it.
    let activate_device = async {
        if let Some(device_row) = device_row {
            let mut device_active = device_row.into_active_model();
            device_active.status = Set(DeviceStatusEnum::Active);
            device_active.updated_at = Set(Utc::now().into());
            device_active
                .update(&state.db)
                .await
                .expect("failed to activate requesting device");
        }
    };
    let (updated, ()) = tokio::join!(active.update(&state.db), activate_device);
    let updated = updated.expect("failed to complete recovery request");

    Json(to_recovery_request_response(
        updated, total, approved, declined,
    ))
    .into_response()
}

async fn find_contact_row(
    db: &sea_orm::DatabaseConnection,
    recovery_request_id: Uuid,
    caller_user_id: &str,
) -> Option<(recovery_request::Model, recovery_request_contact::Model)> {
    // Independent of each other - resolved concurrently rather than
    // waiting on the request before even starting the contact-row fetch.
    let (request, contact_rows) = tokio::join!(
        recovery_request::Entity::find_by_id(recovery_request_id)
            .filter(recovery_request::Column::Status.eq(RecoveryRequestStatusEnum::Pending))
            .one(db),
        recovery_request_contact::Entity::find()
            .filter(recovery_request_contact::Column::RecoveryRequestId.eq(recovery_request_id))
            .filter(
                recovery_request_contact::Column::Status
                    .eq(RecoveryRequestContactStatusEnum::Pending),
            )
            .all(db),
    );
    let request = request.expect("failed to query recovery request")?;
    let contact_rows = contact_rows.expect("failed to query recovery request contact rows");

    // One batched lookup instead of one `trusted_contact` query per
    // pending row - this used to cost up to N queries just to find which
    // one row matches the caller.
    let trusted_contact_ids: Vec<Uuid> =
        contact_rows.iter().map(|r| r.trusted_contact_id).collect();
    let trusted_contacts: HashMap<Uuid, trusted_contact::Model> = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::Id.is_in(trusted_contact_ids))
        .all(db)
        .await
        .expect("failed to query trusted contacts")
        .into_iter()
        .map(|row| (row.id, row))
        .collect();

    let row = contact_rows.into_iter().find(|row| {
        trusted_contacts
            .get(&row.trusted_contact_id)
            .and_then(|contact| contact.contact_user_id.as_deref())
            == Some(caller_user_id)
    })?;
    Some((request, row))
}

/// The contact's own already-held plaintext share, re-sealed client-side
/// to the requesting device's public key - this handler just stores the
/// resulting ciphertext, blind to its contents, same as every other
/// sealed-envelope endpoint in this scheme.
#[utoipa::path(
    post,
    path = "/recovery-request/{recovery_request_id}/approve",
    tag = "RecoveryRequests",
    params(("recovery_request_id" = Uuid, Path, description = "Recovery request id")),
    request_body = MeRecoveryRequestsApproveRequest,
    responses(
        (status = 200, description = "Approved", body = MeRecoveryRequestsContactResponse),
        (status = 404, description = "Not found, not yours to approve, or already resolved")
    )
)]
pub async fn approve_recovery_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
    Json(body): Json<MeRecoveryRequestsApproveRequest>,
) -> impl IntoResponse {
    let Some((request, row)) = find_contact_row(&state.db, id, &session.user.id).await else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mut active = row.into_active_model();
    active.status = Set(RecoveryRequestContactStatusEnum::Approved);
    active.encrypted_share = Set(Some(body.encrypted_share));
    active.responded_at = Set(Some(Utc::now().into()));
    let updated = active
        .update(&state.db)
        .await
        .expect("failed to approve recovery request");

    notify_owner_of_response(&state, &request).await;

    let response = to_pending_contact_response(&state, &request, updated).await;
    Json(response).into_response()
}

#[utoipa::path(
    post,
    path = "/recovery-request/{recovery_request_id}/decline",
    tag = "RecoveryRequests",
    params(("recovery_request_id" = Uuid, Path, description = "Recovery request id")),
    responses(
        (status = 200, description = "Declined", body = MeRecoveryRequestsContactResponse),
        (status = 404, description = "Not found, not yours to decline, or already resolved")
    )
)]
pub async fn decline_recovery_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let Some((request, row)) = find_contact_row(&state.db, id, &session.user.id).await else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mut active = row.into_active_model();
    active.status = Set(RecoveryRequestContactStatusEnum::Declined);
    active.responded_at = Set(Some(Utc::now().into()));
    let updated = active
        .update(&state.db)
        .await
        .expect("failed to decline recovery request");

    notify_owner_after_decline(&state, &request).await;

    let response = to_pending_contact_response(&state, &request, updated).await;
    Json(response).into_response()
}

/// Shared by `approve_recovery_request`/`decline_recovery_request` - same
/// shape a contact's pending-approvals inbox already shows them.
pub(crate) async fn to_pending_contact_response(
    state: &AppState,
    request: &recovery_request::Model,
    row: recovery_request_contact::Model,
) -> MeRecoveryRequestsContactResponse {
    // Independent of each other - resolved concurrently.
    let (mut owner_profiles, requesting_device) = tokio::join!(
        profiles_for(
            &state.db,
            vec![request.owner_user_id.clone()],
            &state.config,
        ),
        device::Entity::find_by_id(request.requesting_device_id).one(&state.db),
    );
    let owner_profile = owner_profiles
        .remove(&request.owner_user_id)
        .expect("owner profile missing for an in-flight recovery request");
    let requesting_device_public_key = requesting_device
        .expect("failed to query requesting device")
        .map(|d| d.public_key)
        .unwrap_or_default();

    MeRecoveryRequestsContactResponse {
        id: row.id.to_string(),
        recovery_request_id: request.id.to_string(),
        status: row.status.into(),
        owner: owner_profile,
        requesting_device_public_key,
        created_at: row.created_at.to_rfc3339(),
    }
}

/// Realtime progress update + push, to the owner's requesting device -
/// shared by both `approve_recovery_request` and `decline_recovery_request`,
/// since both change the same counts the waiting screen shows.
async fn notify_owner_of_response(state: &AppState, request: &recovery_request::Model) {
    // Independent of each other - resolved concurrently.
    let (rows, fresh) = tokio::join!(
        fetch_contact_rows(&state.db, request.id),
        recovery_request::Entity::find_by_id(request.id).one(&state.db),
    );
    let (total, approved, declined) = tally(&rows);
    let Some(fresh) = fresh.expect("failed to re-query recovery request") else {
        return;
    };

    state.user_events_hub.publish(
        request.owner_user_id.clone(),
        MeEventsUserEvent::RecoveryRequestContactResponded(to_recovery_request_response(
            fresh, total, approved, declined,
        )),
    );

    // Only the requesting device is waiting on this - every other device
    // was already revoked when the request started.
    let job = NotifyJob::PushNotification(PushNotifyPayload {
        target: PushTarget::Device {
            user_id: request.owner_user_id.clone(),
            device_id: request.requesting_device_id.to_string(),
        },
        content: PushContent::RecoveryRequestContactResponded {
            approved: approved as u32,
            declined: declined as u32,
            total: total as u32,
        },
    });
    state
        .notify_queue
        .add(job.name(), job.data(), None)
        .await
        .expect("failed to enqueue recovery-request-responded push");
}

/// Same as `notify_owner_of_response`, except a decline can also make the
/// request provably unrecoverable (see `is_unrecoverable`) - when it
/// does, sends `RecoveryRequestFailed` instead of the ordinary update.
async fn notify_owner_after_decline(state: &AppState, request: &recovery_request::Model) {
    let rows = fetch_contact_rows(&state.db, request.id).await;
    if !is_unrecoverable(&rows) {
        notify_owner_of_response(state, request).await;
        return;
    }
    let Some(failed) = mark_failed(&state.db, request.id).await else {
        return;
    };

    let (total, approved, declined) = tally(&rows);
    state.user_events_hub.publish(
        request.owner_user_id.clone(),
        MeEventsUserEvent::RecoveryRequestContactResponded(to_recovery_request_response(
            failed, total, approved, declined,
        )),
    );

    let job = NotifyJob::PushNotification(PushNotifyPayload {
        target: PushTarget::Device {
            user_id: request.owner_user_id.clone(),
            device_id: request.requesting_device_id.to_string(),
        },
        content: PushContent::RecoveryRequestFailed,
    });
    state
        .notify_queue
        .add(job.name(), job.data(), None)
        .await
        .expect("failed to enqueue recovery-request-failed push");
}

/// Called from `revoke_trusted_contact` to withdraw any standing ask on
/// an in-flight recovery request - revoking can't recall an already-
/// sealed share, but can still pull back the request. Loops rather than
/// assuming at most one match: cancelling/completing a request never
/// touches its own contact rows, so a stale `Pending` row can outlive an
/// already-resolved request - only one whose *request* is still
/// `Pending` is live. A no-op in the common case (no such row).
pub(crate) async fn decline_pending_response_on_revoke(state: &AppState, trusted_contact_id: Uuid) {
    let pending_rows = recovery_request_contact::Entity::find()
        .filter(recovery_request_contact::Column::TrustedContactId.eq(trusted_contact_id))
        .filter(
            recovery_request_contact::Column::Status.eq(RecoveryRequestContactStatusEnum::Pending),
        )
        .all(&state.db)
        .await
        .expect("failed to query recovery request contact rows for revoke");

    for row in pending_rows {
        let Some(request) = recovery_request::Entity::find_by_id(row.recovery_request_id)
            .filter(recovery_request::Column::Status.eq(RecoveryRequestStatusEnum::Pending))
            .one(&state.db)
            .await
            .expect("failed to query recovery request for revoke")
        else {
            continue;
        };

        let mut active = row.into_active_model();
        active.status = Set(RecoveryRequestContactStatusEnum::Declined);
        active.responded_at = Set(Some(Utc::now().into()));
        active
            .update(&state.db)
            .await
            .expect("failed to decline recovery request contact row on revoke");

        notify_owner_after_decline(state, &request).await;
    }
}
