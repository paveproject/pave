use super::dto::{MeRecoveryKeyMnemonicResponse, MeRecoveryKeyMnemonicSetRequest};
use crate::app::me::devices::handlers::to_device_response;
use crate::app::me::handlers::find_pave_user_row;
use crate::app::me::recovery_requests::handlers::cancel_recovery_request_model;
use crate::app::me::trusted_contacts::handlers::device_summaries_for;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use better_auth::prelude::AuthSession;
use chrono::Utc;
use db_rs::device;
use db_rs::recovery_key_mnemonic;
use db_rs::recovery_request;
use db_rs::recovery_request_contact;
use db_rs::sea_orm_active_enums::{DeviceStatusEnum, RecoveryRequestStatusEnum};
use notify_contracts::{Lang, LinkEmailPayload, NotifyJob};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
    QueryOrder,
};

fn to_response(model: recovery_key_mnemonic::Model) -> MeRecoveryKeyMnemonicResponse {
    MeRecoveryKeyMnemonicResponse {
        encrypted_dek: model.encrypted_dek,
        created_at: model.created_at.to_rfc3339(),
        updated_at: model.updated_at.to_rfc3339(),
    }
}

/// Idempotent upsert, keyed on `user_id` (the table's own primary key) -
/// called both at initial setup and silently on every later DEK rotation
/// (see mobile's `useReconcileMnemonicUpload`), so there's no meaningful
/// "already set up" error case to reject.
///
/// A device with an already-live session (e.g. seized, shoulder-surfed)
/// can call this to silently overwrite the blob with one sealed to a
/// phrase only an attacker knows - a backdoor planted with zero other
/// trace, since nothing about this call is otherwise visible to the real
/// owner. This is why `get_recovery_key_mnemonic` emails unconditionally
/// on every fetch; the write side needs the exact same unconditional
/// safety net, not just the read side.
#[utoipa::path(
    put,
    path = "/me/recovery-key-mnemonic",
    tag = "Me",
    request_body = MeRecoveryKeyMnemonicSetRequest,
    responses((status = 200, description = "Recovery-phrase blob stored", body = MeRecoveryKeyMnemonicResponse))
)]
pub async fn set_recovery_key_mnemonic(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<MeRecoveryKeyMnemonicSetRequest>,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();

    // Independent of the upsert below - resolved concurrently.
    let (existing, pave_user_row) = tokio::join!(
        recovery_key_mnemonic::Entity::find_by_id(user_id.clone()).one(&state.db),
        find_pave_user_row(&state.db, &user_id),
    );
    let existing = existing.expect("failed to query recovery key mnemonic");

    let model = match existing {
        Some(model) => {
            let mut active = model.into_active_model();
            active.encrypted_dek = Set(body.encrypted_dek);
            active.updated_at = Set(Utc::now().into());
            active
                .update(&state.db)
                .await
                .expect("failed to update recovery key mnemonic")
        }
        None => recovery_key_mnemonic::ActiveModel {
            user_id: Set(user_id),
            encrypted_dek: Set(body.encrypted_dek),
            created_at: Set(Utc::now().into()),
            updated_at: Set(Utc::now().into()),
        }
        .insert(&state.db)
        .await
        .expect("failed to create recovery key mnemonic"),
    };

    if let Some(email) = session.user.email {
        let lang = match pave_user_row.language.as_str() {
            "fr-FR" => Lang::Fr,
            _ => Lang::En,
        };
        let job = NotifyJob::RecoveryKeyMnemonicSetEmail(LinkEmailPayload {
            email,
            url: "pave://settings/recovery".to_string(),
            lang,
        });
        state
            .notify_queue
            .add(job.name(), job.data(), None)
            .await
            .expect("failed to enqueue recovery-key-mnemonic-set email");
    }

    Json(to_response(model))
}

/// The server can never verify a fetch here actually led to a correct
/// decrypt (the blob is opaque) - this path trades the trusted-contacts
/// flow's quorum + mandatory delay for instant access, so the *only*
/// safety net is this: every single fetch, successful or not, emails the
/// owner immediately. A 404 still counts (and still emails) - someone
/// probing this endpoint on an account that never set one up is itself
/// signal worth surfacing.
#[utoipa::path(
    get,
    path = "/me/recovery-key-mnemonic",
    tag = "Me",
    responses(
        (status = 200, description = "Recovery-phrase blob", body = MeRecoveryKeyMnemonicResponse),
        (status = 404, description = "Never set up")
    )
)]
pub async fn get_recovery_key_mnemonic(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();

    // Independent of each other - resolved concurrently.
    let (model, pave_user_row) = tokio::join!(
        recovery_key_mnemonic::Entity::find_by_id(user_id.clone()).one(&state.db),
        find_pave_user_row(&state.db, &user_id),
    );
    let model = model.expect("failed to query recovery key mnemonic");

    if let Some(email) = session.user.email {
        let lang = match pave_user_row.language.as_str() {
            "fr-FR" => Lang::Fr,
            _ => Lang::En,
        };
        let job = NotifyJob::RecoveryKeyMnemonicFetchedEmail(LinkEmailPayload {
            email,
            url: "pave://settings/recovery".to_string(),
            lang,
        });
        state
            .notify_queue
            .add(job.name(), job.data(), None)
            .await
            .expect("failed to enqueue recovery-key-mnemonic-fetched email");
    }

    match model {
        Some(model) => Json(to_response(model)).into_response(),
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

/// Activates the caller's own `pending` device directly - no quorum, no
/// delay. The server trusts the device's self-report the same way
/// `recovery_requests::handlers::complete_recovery_request` already does
/// (there's no way to verify a client-side decrypt either way); the real
/// gates are "you have an authenticated session for this account" and
/// "you had the 24-word phrase", not anything checked here. Also cancels
/// any in-flight trusted-contacts recovery request for this owner, so
/// resolving recovery through one path never leaves the other dangling -
/// and, like `recovery_requests::handlers::create_recovery_request`,
/// suspends every other device and revokes its session: this path
/// answers the same "I have no access to my other devices" declaration,
/// so it must carry the same consequence for them.
#[utoipa::path(
    post,
    path = "/me/recovery-key-mnemonic/activate",
    tag = "Me",
    responses(
        (status = 200, description = "Activated", body = crate::app::me::devices::dto::MeDevicesResponse),
        (status = 400, description = "This device must register itself (PUT /me/devices) first"),
        (status = 403, description = "Already active")
    )
)]
pub async fn activate_via_recovery_key_mnemonic(
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
            "this device must register itself (PUT /me/devices) before activating",
        )
            .into_response();
    };

    if this_device.status == DeviceStatusEnum::Active {
        return (StatusCode::FORBIDDEN, "already active").into_response();
    }

    let this_device_id = this_device.id;
    let mut active = this_device.into_active_model();
    active.status = Set(DeviceStatusEnum::Active);
    active.updated_at = Set(Utc::now().into());

    // Independent of each other - resolved concurrently.
    let (activated, pave_user_row) = tokio::join!(
        active.update(&state.db),
        find_pave_user_row(&state.db, &owner_user_id),
    );
    let activated = activated.expect("failed to activate device");

    // Its own notification, not borrowed from the mobile client's habit of
    // calling `GET` (which emails) right before this - that's a client-side
    // coupling, not a server-side guarantee. See `RecoveryKeyMnemonicActivatedEmail`'s
    // own doc comment.
    if let Some(email) = session.user.email.clone() {
        let lang = match pave_user_row.language.as_str() {
            "fr-FR" => Lang::Fr,
            _ => Lang::En,
        };
        let job = NotifyJob::RecoveryKeyMnemonicActivatedEmail(LinkEmailPayload {
            email,
            url: "pave://settings/recovery".to_string(),
            lang,
        });
        state
            .notify_queue
            .add(job.name(), job.data(), None)
            .await
            .expect("failed to enqueue recovery-key-mnemonic-activated email");
    }

    // Independent of the activation above - a dangling trusted-contacts
    // request isn't harmed by being resolved slightly after the fact.
    let pending_request = recovery_request::Entity::find()
        .filter(recovery_request::Column::OwnerUserId.eq(owner_user_id.clone()))
        .filter(recovery_request::Column::Status.eq(RecoveryRequestStatusEnum::Pending))
        .one(&state.db)
        .await
        .expect("failed to query in-flight recovery request");

    if let Some(model) = pending_request {
        let (contact_rows, owner_devices) = tokio::join!(
            recovery_request_contact::Entity::find()
                .filter(recovery_request_contact::Column::RecoveryRequestId.eq(model.id))
                .all(&state.db),
            device_summaries_for(&state.db, &owner_user_id),
        );
        let contact_rows = contact_rows.expect("failed to query recovery request contacts");

        let owner_profile = crate::app::me::dto::MeProfile {
            id: owner_user_id.clone(),
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

        cancel_recovery_request_model(
            &state,
            model,
            contact_rows,
            owner_user_id.clone(),
            owner_profile,
        )
        .await;
    }

    // Recovering via the phrase is the same declaration as starting a
    // trusted-contacts request - "I have no access to my other devices" -
    // so it must carry the same consequence for them (see
    // `create_recovery_request`): suspended, sessions revoked. Runs last,
    // after any in-flight request above was cancelled (which provisionally
    // restores its own suspended siblings), so this is the final word -
    // every other device ends up suspended regardless of what a dangling
    // trusted-contacts request had done to them.
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
        .exec(&state.db)
        .await
        .expect("failed to suspend sibling devices");

    // Suspending the device rows isn't enough on its own - their bearer
    // tokens stay valid against every other endpoint until the session
    // behind each one is actually revoked (see `create_recovery_request`'s
    // own comment).
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

    Json(to_device_response(activated)).into_response()
}
