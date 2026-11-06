use super::dto::{MeDevicesDeclinedResponse, MeDevicesResponse, MeDevicesSetDekRequest};
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::libs::geoip;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use better_auth::prelude::AuthSession;
use chrono::Utc;
use db_rs::device;
use db_rs::sea_orm_active_enums::{DeviceStatusEnum, TrustedContactStatusEnum};
use db_rs::trusted_contact;
use notify_contracts::{NotifyJob, PushContent, PushNotifyPayload, PushTarget};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait,
    QueryFilter,
};
use uuid::Uuid;

pub(crate) fn to_device_response(model: device::Model) -> MeDevicesResponse {
    MeDevicesResponse {
        id: model.id.to_string(),
        public_key: model.public_key,
        device_type: model.device_type.into(),
        status: model.status.into(),
        encrypted_dek: model.encrypted_dek,
        location_city: model.location_city,
        location_country: model.location_country,
        created_at: model.created_at.to_rfc3339(),
        updated_at: model.updated_at.to_rfc3339(),
    }
}

/// First device on an account with nothing yet to protect skips approval
/// (see `set_device`) - true if either an other device or an accepted
/// trusted contact already exists. The two checks are independent, so run
/// concurrently rather than serially.
pub(crate) async fn account_has_protected_state(
    db: &sea_orm::DatabaseConnection,
    user_id: &str,
) -> bool {
    let has_other_device = device::Entity::find()
        .filter(device::Column::UserId.eq(user_id.to_string()))
        .one(db);
    let has_accepted_contact = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::OwnerUserId.eq(user_id.to_string()))
        .filter(trusted_contact::Column::Status.eq(TrustedContactStatusEnum::Accepted))
        .one(db);

    let (has_other_device, has_accepted_contact) =
        tokio::try_join!(has_other_device, has_accepted_contact)
            .expect("failed to query protected-state signals");

    has_other_device.is_some() || has_accepted_contact.is_some()
}

/// Resolves the caller's own `active` device from `(user_id, session_id)` -
/// required by `approve_device`/`decline_device`/`revoke_device` (a device
/// can't act on a sibling unless it's trusted itself) and by
/// `pending_actions::get_pending_actions`.
pub(crate) async fn resolve_active_caller_device(
    db: &sea_orm::DatabaseConnection,
    user_id: &str,
    session_id: &str,
) -> Option<device::Model> {
    device::Entity::find()
        .filter(device::Column::UserId.eq(user_id.to_string()))
        .filter(device::Column::SessionId.eq(session_id.to_string()))
        .filter(device::Column::Status.eq(DeviceStatusEnum::Active))
        .one(db)
        .await
        .expect("failed to query caller device")
}

/// Best-effort: revoking a device's row is pointless as a security
/// boundary if its bearer token still works against every other endpoint
/// afterwards. `device.session_id` is only ever a snapshot of the id the
/// session had when last registered (see `device.ts`'s own doc comment on
/// `sessionId`) - a silent no-op if it already rotated since (the common
/// "actually fine" case: the user just re-logged-in on that device, which
/// is a different bearer token than the one being revoked here anyway).
pub(crate) async fn revoke_devices_session(
    state: &AppState,
    user_id: &str,
    stored_session_id: &str,
) {
    let sessions = state
        .auth
        .store()
        .get_user_sessions(user_id)
        .await
        .expect("failed to list sessions for revocation");
    let Some(session) = sessions
        .iter()
        .find(|s| s.id().as_ref() == stored_session_id)
    else {
        return;
    };
    state
        .auth
        .store()
        .delete_session(session.token())
        .await
        .expect("failed to revoke device session");
}

/// Enqueues a `PushNotification` job - `notify` resolves tokens/providers/
/// language itself from `target`.
pub(crate) async fn enqueue_push(state: &AppState, target: PushTarget, content: PushContent) {
    let job = NotifyJob::PushNotification(PushNotifyPayload { target, content });
    state
        .notify_queue
        .add(job.name(), job.data(), None)
        .await
        .expect("failed to enqueue device push notification");
}

/// Best-effort geoip lookup, shown to the siblings asked to approve a
/// `Pending` device - shared by both the brand-new-device case and the
/// re-pending-after-suspension case in `set_device`.
pub(crate) fn lookup_pending_location(
    state: &AppState,
    headers: &axum::http::HeaderMap,
) -> (Option<String>, Option<String>) {
    state
        .geoip
        .as_ref()
        .and_then(|geoip| {
            geoip::client_ip_from_headers(headers).and_then(|ip| geoip.lookup_city_country(ip))
        })
        .map_or((None, None), |(city, country)| (Some(city), Some(country)))
}

/// A device can't revoke itself - only an already-`active` sibling can.
/// This makes "zero `active` devices left" structurally impossible here
/// with no extra count check: the caller's own `active` row always
/// survives. The bulk wipe in `create_recovery_request` is a deliberately
/// separate path, not this endpoint.
#[utoipa::path(
    delete,
    path = "/device/{device_id}",
    tag = "Devices",
    params(("device_id" = Uuid, Path, description = "Device id")),
    responses(
        (status = 200, description = "Revoked"),
        (status = 403, description = "Can't revoke yourself, or the caller isn't an active device"),
        (status = 404, description = "Not found, or not yours to revoke")
    )
)]
pub async fn revoke_device(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let target = device::Entity::find_by_id(id)
        .filter(device::Column::UserId.eq(session.user.id.clone()))
        .one(&state.db);
    let caller_device =
        resolve_active_caller_device(&state.db, &session.user.id, &session.session.id);
    let (target, caller_device) = tokio::join!(target, caller_device);

    let Some(model) = target.expect("failed to query device") else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if model.session_id == session.session.id {
        return StatusCode::FORBIDDEN.into_response();
    }
    if caller_device.is_none() {
        return StatusCode::FORBIDDEN.into_response();
    }
    let target_session_id = model.session_id.clone();

    // Hard delete, unlike `trusted_contact`'s soft `Revoked` status -
    // nothing reads a device's history, and the FK cascade on
    // `trusted_contact_share`/dependents cleans up on its own.
    let (delete_result, ()) = tokio::join!(
        model.delete(&state.db),
        revoke_devices_session(&state, &session.user.id, &target_session_id),
    );
    delete_result.expect("failed to revoke device");

    StatusCode::OK.into_response()
}

/// Deposits a sealed copy of the caller's own recovery key for one of
/// their *other* devices - a direct seal, no Shamir split (not a quorum
/// problem), opaque to the server.
///
/// Restricted to a target that's already `active` - the mobile client's
/// own reconciliation logic (`planReconciliation`) already excludes
/// `pending`/`suspended` devices from the set it ever seals to, but that's
/// a client-side intent, not a server-side gate. Without this check here
/// too, a buggy or malicious client could hand the DEK straight to a
/// device still waiting on approval (or one a recovery path just locked
/// out), making "pending"/"suspended" purely cosmetic for confidentiality
/// instead of an actual boundary.
#[utoipa::path(
    put,
    path = "/device/{device_id}/dek",
    tag = "Devices",
    params(("device_id" = Uuid, Path, description = "Target device id")),
    request_body = MeDevicesSetDekRequest,
    responses(
        (status = 200, description = "Recovery key copy deposited", body = MeDevicesResponse),
        (status = 404, description = "Not found, not yours, or not active")
    )
)]
pub async fn set_device_dek(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
    Json(body): Json<MeDevicesSetDekRequest>,
) -> impl IntoResponse {
    let user_id = session.user.id;

    let Some(model) = device::Entity::find_by_id(id)
        .filter(device::Column::UserId.eq(user_id.clone()))
        .filter(device::Column::Status.eq(DeviceStatusEnum::Active))
        .one(&state.db)
        .await
        .expect("failed to query device")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mut active = model.into_active_model();
    active.encrypted_dek = Set(Some(body.encrypted_dek));
    active.updated_at = Set(Utc::now().into());
    let updated = active
        .update(&state.db)
        .await
        .expect("failed to set device recovery-key copy");

    let response = to_device_response(updated);
    state.user_events_hub.publish(
        user_id,
        MeEventsUserEvent::DeviceDekUpdated(response.clone()),
    );

    Json(response).into_response()
}

/// Flips the pending device's status only - the DEK itself travels later,
/// through the ordinary `set_device_dek` reconciliation path.
#[utoipa::path(
    post,
    path = "/device/{device_id}/approve",
    tag = "Devices",
    params(("device_id" = Uuid, Path, description = "Pending device id")),
    responses(
        (status = 200, description = "Approved - now eligible to receive the recovery key", body = MeDevicesResponse),
        (status = 403, description = "The caller's own device isn't active yet, so it can't approve anyone"),
        (status = 404, description = "Not found, not yours, or not pending")
    )
)]
pub async fn approve_device(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let user_id = session.user.id;

    let caller_device = resolve_active_caller_device(&state.db, &user_id, &session.session.id);
    let target = device::Entity::find_by_id(id)
        .filter(device::Column::UserId.eq(user_id.clone()))
        .filter(device::Column::Status.eq(DeviceStatusEnum::Pending))
        .one(&state.db);
    let (caller_device, target) = tokio::join!(caller_device, target);

    if caller_device.is_none() {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Some(model) = target.expect("failed to query device") else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mut active = model.into_active_model();
    active.status = Set(DeviceStatusEnum::Active);
    // No reason to keep location on file once trusted.
    active.location_city = Set(None);
    active.location_country = Set(None);
    active.updated_at = Set(Utc::now().into());
    let updated = active
        .update(&state.db)
        .await
        .expect("failed to approve device");

    enqueue_push(
        &state,
        PushTarget::Device {
            user_id: user_id.clone(),
            device_id: updated.id.to_string(),
        },
        PushContent::DeviceApproved,
    )
    .await;

    let response = to_device_response(updated);
    state
        .user_events_hub
        .publish(user_id, MeEventsUserEvent::DeviceApproved(response.clone()));

    Json(response).into_response()
}

/// No bank-style approval was ever granted, so there's nothing to revoke
/// beyond the pending row itself - same hard-delete convention as
/// `revoke_device`.
#[utoipa::path(
    post,
    path = "/device/{device_id}/decline",
    tag = "Devices",
    params(("device_id" = Uuid, Path, description = "Pending device id")),
    responses(
        (status = 200, description = "Declined - the pending device is removed", body = MeDevicesDeclinedResponse),
        (status = 403, description = "The caller's own device isn't active yet, so it can't decline anyone"),
        (status = 404, description = "Not found, not yours, or not pending")
    )
)]
pub async fn decline_device(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();

    let caller_device = resolve_active_caller_device(&state.db, &user_id, &session.session.id);
    let target = device::Entity::find_by_id(id)
        .filter(device::Column::UserId.eq(user_id.clone()))
        .filter(device::Column::Status.eq(DeviceStatusEnum::Pending))
        .one(&state.db);
    let (caller_device, target) = tokio::join!(caller_device, target);

    if caller_device.is_none() {
        return StatusCode::FORBIDDEN.into_response();
    }
    let Some(model) = target.expect("failed to query device") else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let response = MeDevicesDeclinedResponse {
        id: model.id.to_string(),
    };

    // Enqueued before deleting - `notify` resolves this device's tokens
    // via its still-live row (see `PushTarget::Device`), so the job has to
    // be handed off while it still exists.
    enqueue_push(
        &state,
        PushTarget::Device {
            user_id: user_id.clone(),
            device_id: model.id.to_string(),
        },
        PushContent::DeviceDeclined,
    )
    .await;

    let target_session_id = model.session_id.clone();
    let (delete_result, ()) = tokio::join!(
        model.delete(&state.db),
        revoke_devices_session(&state, &user_id, &target_session_id),
    );
    delete_result.expect("failed to decline device");

    state.user_events_hub.publish(
        user_id,
        MeEventsUserEvent::DeviceApprovalDeclined(response.clone()),
    );

    Json(response).into_response()
}
