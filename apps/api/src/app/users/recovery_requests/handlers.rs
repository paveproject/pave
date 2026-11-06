use crate::app::access::authorize_user_scope;
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::app::me::handlers::find_pave_user_row;
use crate::app::recovery_requests::dto::{
    MeRecoveryRequestsContactResponse, MeRecoveryRequestsContactStatus, MeRecoveryRequestsResponse,
};
use crate::app::recovery_requests::handlers::to_recovery_request_response;
use crate::app::trusted_contacts::handlers::device_summaries_for;
use crate::state::AppState;
use auth::schema::user as auth_user;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use better_auth::prelude::AuthSession;
use bullmq_rs::JobOptions;
use chrono::{Duration, Utc};
use db_rs::device;
use db_rs::recovery_request;
use db_rs::recovery_request_contact;
use db_rs::sea_orm_active_enums::{
    DeviceStatusEnum, RecoveryRequestContactStatusEnum, RecoveryRequestStatusEnum,
    TrustedContactStatusEnum,
};
use db_rs::trusted_contact;
use notify_contracts::{
    Lang, LinkEmailPayload, NotifyJob, PushContent, PushNotifyPayload, PushTarget,
};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DbErr, EntityTrait, QueryFilter, QueryOrder,
    TransactionTrait,
};
use std::collections::HashMap;
use uuid::Uuid;

/// Starts a recovery request - the owner's last resort once none of their
/// own devices can help. Atomically: every *other* device this user has
/// is suspended and its session revoked (starting a recovery request
/// *means* none of them can help - see `cancel_recovery_request` for the
/// reversal), and any previous still-pending request is cancelled first.
#[utoipa::path(
    post,
    path = "/user/{user_id}/recovery-requests",
    tag = "RecoveryRequests",
    params(("user_id" = String, Path, description = "Account to recover")),
    responses(
        (status = 200, description = "Recovery request started", body = MeRecoveryRequestsResponse),
        (
            status = 400,
            description = "This device isn't registered yet, or there's no accepted trusted contact to ask"
        ),
        (
            status = 403,
            description = "The caller is already `active` - recovery is only for a device that doesn't have the key yet"
        ),
        (status = 404, description = "Not your account")
    )
)]
pub async fn create_recovery_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
) -> impl IntoResponse {
    if let Err(status) = authorize_user_scope(&session, &user_id) {
        return status.into_response();
    }

    let owner_user_id = user_id;

    // `session_id` is diagnostic only (see `device.ts`'s own doc comment)
    // - not unique, so more than one row can share it (e.g. a device
    // re-registering with a fresh identity keypair under the same still-
    // live session, as `wipeOwnRecoveryState`'s own debug flow does).
    // Newest first makes the match deterministic and picks the row this
    // request actually means: the one just registered, not an older
    // sibling that happens to share the same session.
    let Some(this_device) = device::Entity::find()
        .filter(device::Column::UserId.eq(owner_user_id.clone()))
        .filter(device::Column::SessionId.eq(session.session.id.clone()))
        .order_by_desc(device::Column::CreatedAt)
        .one(&state.db)
        .await
        .expect("failed to query requesting device")
    else {
        return (
            StatusCode::BAD_REQUEST,
            "this device must register itself (PUT /me/devices) before starting a recovery request",
        )
            .into_response();
    };

    // An `active` device already has (or can get) the key through the
    // ordinary sibling-approval path - letting it trigger this would
    // irreversibly wipe every other device for no reason.
    if this_device.status != DeviceStatusEnum::Pending {
        return (
            StatusCode::FORBIDDEN,
            "already active - recovery is only for a device that hasn't been approved yet",
        )
            .into_response();
    }

    // Independent of each other - resolved concurrently. The owner's own
    // row is needed now (not just later, for `owner_lang`) to pick which of
    // the two configured delays applies.
    let (accepted_contacts, owner_row) = tokio::join!(
        trusted_contact::Entity::find()
            .filter(trusted_contact::Column::OwnerUserId.eq(owner_user_id.clone()))
            .filter(trusted_contact::Column::Status.eq(TrustedContactStatusEnum::Accepted))
            .all(&state.db),
        find_pave_user_row(&state.db, &owner_user_id),
    );
    let accepted_contacts = accepted_contacts.expect("failed to query accepted trusted contacts");

    // Zero accepted contacts means zero quorum, ever - this device's
    // siblings are about to be wiped for a request that could never
    // resolve, so refuse outright instead of creating a dead end.
    if accepted_contacts.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            "no accepted trusted contact to ask - add one before starting a recovery request",
        )
            .into_response();
    }

    // "Mode manif" swaps in the shorter delay - see `useProtestMode` on the
    // mobile side for how this gets toggled (offline-first).
    let delay_seconds = if owner_row.protest_mode_enabled {
        owner_row.recovery_delay_protest_seconds
    } else {
        owner_row.recovery_delay_seconds
    };
    let delay = Duration::seconds(delay_seconds.into());

    let now = Utc::now();
    let request_id = Uuid::new_v4();
    let this_device_id = this_device.id;

    // Atomic: without a transaction, a concurrent call racing in between
    // could leave the owner with the old request cancelled but no new
    // one (if the insert then failed). The partial unique index on
    // `(owner_user_id) WHERE status = 'pending'` (see `recoveryRequest.ts`)
    // is the backstop, turning a genuine race into a clean rollback.
    let model = state
        .db
        .transaction::<_, _, DbErr>({
            let owner_user_id = owner_user_id.clone();
            let accepted_contacts = accepted_contacts.clone();
            move |txn| {
                Box::pin(async move {
                    // Every other device stops being a viable sync target
                    // the instant a recovery request starts - suspended,
                    // not deleted, so a cancelled request can restore them
                    // (see `cancel_recovery_request`).
                    device::Entity::update_many()
                        .col_expr(
                            device::Column::Status,
                            sea_orm::sea_query::Expr::value(DeviceStatusEnum::Suspended),
                        )
                        .col_expr(
                            device::Column::UpdatedAt,
                            sea_orm::sea_query::Expr::value(Utc::now()),
                        )
                        .filter(device::Column::UserId.eq(owner_user_id.clone()))
                        .filter(device::Column::Id.ne(this_device_id))
                        .exec(txn)
                        .await?;

                    // At most one pending request per owner.
                    recovery_request::Entity::update_many()
                        .col_expr(
                            recovery_request::Column::Status,
                            sea_orm::sea_query::Expr::value(RecoveryRequestStatusEnum::Cancelled),
                        )
                        .col_expr(
                            recovery_request::Column::CancelledAt,
                            sea_orm::sea_query::Expr::value(Utc::now()),
                        )
                        .filter(recovery_request::Column::OwnerUserId.eq(owner_user_id.clone()))
                        .filter(
                            recovery_request::Column::Status.eq(RecoveryRequestStatusEnum::Pending),
                        )
                        .exec(txn)
                        .await?;

                    let model = recovery_request::ActiveModel {
                        id: Set(request_id),
                        owner_user_id: Set(owner_user_id.clone()),
                        requesting_device_id: Set(this_device_id),
                        status: Set(RecoveryRequestStatusEnum::Pending),
                        release_at: Set((now + delay).into()),
                        completed_at: Set(None),
                        cancelled_at: Set(None),
                        failed_at: Set(None),
                        created_at: Set(now.into()),
                        updated_at: Set(now.into()),
                    }
                    .insert(txn)
                    .await?;

                    let contact_models = accepted_contacts
                        .iter()
                        .map(|contact| recovery_request_contact::ActiveModel {
                            id: Set(Uuid::new_v4()),
                            recovery_request_id: Set(request_id),
                            trusted_contact_id: Set(contact.id),
                            status: Set(RecoveryRequestContactStatusEnum::Pending),
                            encrypted_share: Set(None),
                            responded_at: Set(None),
                            created_at: Set(now.into()),
                        })
                        .collect::<Vec<_>>();
                    recovery_request_contact::Entity::insert_many(contact_models)
                        .exec(txn)
                        .await?;

                    Ok(model)
                })
            }
        })
        .await
        .expect("failed to atomically start recovery request");

    // Suspending the device rows isn't enough on its own - their bearer
    // tokens stay valid against every other endpoint until the session
    // behind each one is actually revoked. Every other device's session
    // goes, not just the ones it has a device row for (a stolen token used
    // before ever calling `PUT /me/devices` would otherwise survive this).
    let other_sessions = state
        .auth
        .store()
        .get_user_sessions(&owner_user_id)
        .await
        .expect("failed to list sessions for revocation");
    for other_session in other_sessions {
        if other_session.token() != session.session.token() {
            state
                .auth
                .store()
                .delete_session(other_session.token())
                .await
                .expect("failed to revoke a sibling device's session");
        }
    }

    let owner_username = session
        .user
        .display_username
        .clone()
        .expect("display_username is NOT NULL in db");

    // Three independent lookups, resolved concurrently: the owner's devices
    // (for `owner_profile`), the just-inserted contact rows (one batched
    // refetch instead of one per contact), and the owner's auth row (for
    // the safety-net email). `owner_row` (for `owner_lang` below) is
    // already in hand from before the transaction.
    let (owner_devices, contact_rows, owner_auth) = tokio::join!(
        device_summaries_for(&state.db, &owner_user_id),
        recovery_request_contact::Entity::find()
            .filter(recovery_request_contact::Column::RecoveryRequestId.eq(request_id))
            .all(&state.db),
        auth_user::Entity::find_by_id(owner_user_id.clone()).one(&state.db),
    );
    let contact_rows_by_trusted_contact: HashMap<Uuid, recovery_request_contact::Model> =
        contact_rows
            .expect("failed to query just-created recovery request contact rows")
            .into_iter()
            .map(|row| (row.trusted_contact_id, row))
            .collect();
    let owner_auth = owner_auth.expect("failed to query owner for safety-net email");

    let owner_profile = crate::app::me::dto::MeProfile {
        id: owner_user_id.clone(),
        username: owner_username.clone(),
        image: crate::libs::media::resolve_media_url(
            session.user.image.as_deref(),
            crate::libs::media::AVATARS_FOLDER,
            &state.config,
        ),
        devices: owner_devices,
    };
    let owner_lang = match owner_row.language.as_str() {
        "fr-FR" => Lang::Fr,
        _ => Lang::En,
    };

    // Notify every asked contact - realtime (so it shows up in their
    // pending-approvals inbox live) and push.
    let mut contact_user_ids = Vec::with_capacity(accepted_contacts.len());
    for contact in &accepted_contacts {
        let Some(contact_user_id) = contact.contact_user_id.clone() else {
            continue;
        };
        let contact_row = &contact_rows_by_trusted_contact[&contact.id];

        state.user_events_hub.publish(
            contact_user_id.clone(),
            MeEventsUserEvent::RecoveryRequestCreated(MeRecoveryRequestsContactResponse {
                id: contact_row.id.to_string(),
                recovery_request_id: request_id.to_string(),
                status: MeRecoveryRequestsContactStatus::Pending,
                owner: owner_profile.clone(),
                requesting_device_public_key: this_device.public_key.clone(),
                created_at: contact_row.created_at.to_rfc3339(),
            }),
        );

        contact_user_ids.push(contact_user_id);
    }

    // One job notifies every asked contact at once - `notify` resolves
    // each contact's own tokens and language itself (see
    // `PushTarget::Users`), rather than one job per contact per token.
    if !contact_user_ids.is_empty() {
        let job = NotifyJob::PushNotification(PushNotifyPayload {
            target: PushTarget::Users {
                user_ids: contact_user_ids,
            },
            content: PushContent::RecoveryRequestCreated {
                owner_username: Some(owner_username.clone()),
            },
        });
        state
            .notify_queue
            .add(job.name(), job.data(), None)
            .await
            .expect("failed to enqueue recovery-request-created push");
    }

    // The safety net: an independent channel (email) from whatever
    // device/session the request was made from - always sent, not just
    // when something looks suspicious, since the server can't tell a
    // legitimate re-login apart from a stolen session either way.
    if let Some(email) = owner_auth.and_then(|row| row.email) {
        let job = NotifyJob::RecoveryRequestCreatedEmail(LinkEmailPayload {
            email: email.clone(),
            url: "pave://settings/recovery".to_string(),
            lang: owner_lang,
        });

        // Nothing server-side watches the clock - these two jobs are the
        // mechanism, enqueued now with a `delay` matching the mandatory
        // wait. All three enqueues are independent, done concurrently.
        let ready_delay = Some(JobOptions {
            delay: delay.to_std().ok(),
            ..Default::default()
        });
        let ready_push = NotifyJob::PushNotification(PushNotifyPayload {
            target: PushTarget::Device {
                user_id: owner_user_id.clone(),
                device_id: this_device.id.to_string(),
            },
            content: PushContent::RecoveryRequestReady,
        });
        let ready_email = NotifyJob::RecoveryRequestReadyEmail(LinkEmailPayload {
            email,
            url: "pave://settings/recovery".to_string(),
            lang: owner_lang,
        });

        let (safety_email, ready_push_result, ready_email_result) = tokio::join!(
            state.notify_queue.add(job.name(), job.data(), None),
            state
                .notify_queue
                .add(ready_push.name(), ready_push.data(), ready_delay.clone()),
            state
                .notify_queue
                .add(ready_email.name(), ready_email.data(), ready_delay),
        );
        safety_email.expect("failed to enqueue recovery-request safety-net email");
        ready_push_result.expect("failed to enqueue recovery-request-ready push");
        ready_email_result.expect("failed to enqueue recovery-request-ready email");
    }

    let (total, approved, declined) = (accepted_contacts.len() as i32, 0, 0);
    Json(to_recovery_request_response(
        model, total, approved, declined,
    ))
    .into_response()
}
