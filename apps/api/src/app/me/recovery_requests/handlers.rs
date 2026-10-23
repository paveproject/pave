use super::dto::{
    MeRecoveryRequestsApproveRequest, MeRecoveryRequestsContactResponse,
    MeRecoveryRequestsContactStatus, MeRecoveryRequestsResponse, MeRecoveryRequestsShareItem,
};
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::app::me::handlers::find_pave_user_row;
use crate::app::me::trusted_contacts::handlers::{device_summaries_for, profiles_for};
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
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DbErr, EntityTrait, IntoActiveModel,
    QueryFilter, QueryOrder, TransactionTrait,
};
use std::collections::HashMap;
use uuid::Uuid;

fn to_recovery_request_response(
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

async fn fetch_contact_rows(
    db: &sea_orm::DatabaseConnection,
    recovery_request_id: Uuid,
) -> Vec<recovery_request_contact::Model> {
    recovery_request_contact::Entity::find()
        .filter(recovery_request_contact::Column::RecoveryRequestId.eq(recovery_request_id))
        .all(db)
        .await
        .expect("failed to query recovery request contact rows")
}

fn tally(rows: &[recovery_request_contact::Model]) -> (i32, i32, i32) {
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

/// Starts a recovery request - the owner's last resort once none of their
/// own devices can help. Atomically: every *other* device this user has
/// is suspended and its session revoked (starting a recovery request
/// *means* none of them can help - see `cancel_recovery_request` for the
/// reversal), and any previous still-pending request is cancelled first.
#[utoipa::path(
    post,
    path = "/me/recovery-requests",
    tag = "Me",
    responses(
        (status = 200, description = "Recovery request started", body = MeRecoveryRequestsResponse),
        (
            status = 400,
            description = "This device isn't registered yet, or there's no accepted trusted contact to ask"
        ),
        (
            status = 403,
            description = "The caller is already `active` - recovery is only for a device that doesn't have the key yet"
        )
    )
)]
pub async fn create_recovery_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let owner_user_id = session.user.id.clone();

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

/// What the requesting device polls after a restart, when it may have
/// forgotten the request's id but still needs to resume watching it.
#[utoipa::path(
    get,
    path = "/me/recovery-requests/current",
    tag = "Me",
    responses(
        (status = 200, description = "The owner's current pending recovery request", body = MeRecoveryRequestsResponse),
        (status = 404, description = "No pending recovery request")
    )
)]
pub async fn get_current_recovery_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let Some(model) = recovery_request::Entity::find()
        .filter(recovery_request::Column::OwnerUserId.eq(session.user.id))
        .filter(recovery_request::Column::Status.eq(RecoveryRequestStatusEnum::Pending))
        .one(&state.db)
        .await
        .expect("failed to query current recovery request")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let rows = fetch_contact_rows(&state.db, model.id).await;
    let (total, approved, declined) = tally(&rows);
    Json(to_recovery_request_response(
        model, total, approved, declined,
    ))
    .into_response()
}

/// Still blind sealed blobs - refused outright until `releaseAt` passes,
/// regardless of how many contacts have already approved.
#[utoipa::path(
    get,
    path = "/me/recovery-requests/{id}/shares",
    tag = "Me",
    params(("id" = Uuid, Path, description = "Recovery request id")),
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
    path = "/me/recovery-requests/{id}",
    tag = "Me",
    params(("id" = Uuid, Path, description = "Recovery request id")),
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
    path = "/me/recovery-requests/{id}/complete",
    tag = "Me",
    params(("id" = Uuid, Path, description = "Recovery request id")),
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
    path = "/me/recovery-requests/{id}/approve",
    tag = "Me",
    params(("id" = Uuid, Path, description = "Recovery request id")),
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
    path = "/me/recovery-requests/{id}/decline",
    tag = "Me",
    params(("id" = Uuid, Path, description = "Recovery request id")),
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
