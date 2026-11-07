use crate::app::data_access::requests::dto::DataAccessRequestResponse;
use crate::app::data_access::requests::handlers::{
    close_if_expired, load_contact_rows, other_accepted_contacts, resolve_requesting_device,
    to_contact_response, to_response, ACCESS_WINDOW_DAYS,
};
use crate::app::devices::handlers::enqueue_push;
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::app::me::handlers::find_pave_user_row;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::{Duration, Utc};
use db_rs::sea_orm_active_enums::{
    DataAccessRequestContactStatusEnum, DataAccessRequestStatusEnum, TrustedContactStatusEnum,
};
use db_rs::{data_access_request, data_access_request_contact, trusted_contact};
use notify_contracts::{PushContent, PushTarget};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DbErr, EntityTrait, QueryFilter,
    TransactionTrait,
};
use uuid::Uuid;

/// Guarded by the relationship, not `authorize_user_scope`: the caller is by
/// definition *not* the owner, which is the whole point.
#[utoipa::path(
    post,
    path = "/user/{user_id}/data-access/requests",
    tag = "DataAccessRequests",
    params(("user_id" = String, Path, description = "Account whose data is being asked for")),
    responses(
        (status = 200, description = "Request started", body = DataAccessRequestResponse),
        (status = 400, description = "This device isn't registered and active yet"),
        (status = 404, description = "Not an accepted trusted contact of that account"),
        (status = 409, description = "A request from you to that account is already pending")
    )
)]
pub async fn create_data_access_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
) -> impl IntoResponse {
    let requester_user_id = session.user.id.clone();

    // The database refuses this too (`check_..._not_self`).
    if requester_user_id == user_id {
        return StatusCode::NOT_FOUND.into_response();
    }

    // A revoked or pending contact is indistinguishable from a stranger.
    let is_contact = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::OwnerUserId.eq(user_id.clone()))
        .filter(trusted_contact::Column::ContactUserId.eq(requester_user_id.clone()))
        .filter(trusted_contact::Column::Status.eq(TrustedContactStatusEnum::Accepted))
        .one(&state.db)
        .await
        .expect("failed to query the trusted contact relationship")
        .is_some();
    if !is_contact {
        return StatusCode::NOT_FOUND.into_response();
    }

    let Some(requesting_device) =
        resolve_requesting_device(&state.db, &requester_user_id, &session.session.id).await
    else {
        return (
            StatusCode::BAD_REQUEST,
            "register this device before asking for access",
        )
            .into_response();
    };

    // Frees the pair's slot: the partial unique index keys off the stored
    // status, so an elapsed request left `pending` blocks a new one for good.
    if let Some(stale) = data_access_request::Entity::find()
        .filter(data_access_request::Column::OwnerUserId.eq(user_id.clone()))
        .filter(data_access_request::Column::RequesterUserId.eq(requester_user_id.clone()))
        .filter(data_access_request::Column::Status.eq(DataAccessRequestStatusEnum::Pending))
        .one(&state.db)
        .await
        .expect("failed to look for a previous data access request")
    {
        close_if_expired(&state.db, stale).await;
    }

    let owner_row = find_pave_user_row(&state.db, &user_id).await;
    let others = other_accepted_contacts(&state.db, &user_id, &requester_user_id).await;

    let now = Utc::now();
    // Never the protest delay: that one *shortens*, which is backwards here.
    let release_at = now + Duration::seconds(owner_row.data_access_delay_seconds.into());
    let expires_at = release_at + Duration::days(ACCESS_WINDOW_DAYS);
    let request_id = Uuid::new_v4();

    // Atomic: a concurrent approval landing on a request with no contact rows
    // yet would look like a reached quorum.
    let inserted = state
        .db
        .transaction::<_, _, DbErr>({
            let user_id = user_id.clone();
            let requester_user_id = requester_user_id.clone();
            let others = others.clone();
            move |txn| {
                Box::pin(async move {
                    let model = data_access_request::ActiveModel {
                        id: Set(request_id),
                        owner_user_id: Set(user_id),
                        requester_user_id: Set(requester_user_id),
                        requesting_device_id: Set(requesting_device.id),
                        status: Set(DataAccessRequestStatusEnum::Pending),
                        release_at: Set(release_at.into()),
                        expires_at: Set(expires_at.into()),
                        refused_at: Set(None),
                        failed_at: Set(None),
                        cancelled_at: Set(None),
                        created_at: Set(now.into()),
                        updated_at: Set(now.into()),
                    }
                    .insert(txn)
                    .await?;

                    if !others.is_empty() {
                        data_access_request_contact::Entity::insert_many(others.iter().map(
                            |contact| data_access_request_contact::ActiveModel {
                                id: Set(Uuid::new_v4()),
                                data_access_request_id: Set(request_id),
                                trusted_contact_id: Set(contact.id),
                                status: Set(DataAccessRequestContactStatusEnum::Pending),
                                encrypted_share: Set(None),
                                responded_at: Set(None),
                                created_at: Set(now.into()),
                                updated_at: Set(now.into()),
                            },
                        ))
                        .exec(txn)
                        .await?;
                    }

                    Ok(model)
                })
            }
        })
        .await;

    let request = match inserted {
        Ok(model) => model,
        // The index firing is the client-recoverable case.
        Err(error)
            if error
                .to_string()
                .contains("idx_data_access_request_one_pending_per_pair") =>
        {
            return (
                StatusCode::CONFLICT,
                "you already have a pending request for that account",
            )
                .into_response();
        }
        Err(error) => {
            tracing::error!(?error, "failed to start the data access request");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not start the request",
            )
                .into_response();
        }
    };

    let rows = load_contact_rows(&state.db, request.id).await;
    let response = to_response(&state, request.clone(), &rows).await;

    // A request the owner never saw is one they could not refuse, and their
    // window is bounded - hence the only data-access event that also pushes.
    state.user_events_hub.publish(
        request.owner_user_id.clone(),
        MeEventsUserEvent::DataAccessRequested(response.clone()),
    );
    enqueue_push(
        &state,
        PushTarget::Users {
            user_ids: vec![request.owner_user_id.clone()],
        },
        PushContent::DataAccessRequested {
            requester_username: Some(response.requester.username.clone())
                .filter(|name| !name.is_empty()),
        },
    )
    .await;

    // Each asked contact, into their pending-approvals inbox. One event per
    // contact because the payload is their own row, not the shared view.
    for contact in &others {
        let Some(contact_user_id) = contact.contact_user_id.clone() else {
            continue;
        };
        let Some(row) = rows
            .iter()
            .find(|row| row.trusted_contact_id == contact.id)
            .cloned()
        else {
            continue;
        };
        if let Some(payload) = to_contact_response(&state, &request, row).await {
            state.user_events_hub.publish(
                contact_user_id,
                MeEventsUserEvent::DataAccessRequestAsked(payload),
            );
        }
    }

    Json(response).into_response()
}
