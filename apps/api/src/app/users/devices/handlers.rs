use crate::app::access::authorize_user_scope;
use crate::app::devices::dto::{MeDevicesResponse, MeDevicesSetRequest};
use crate::app::devices::handlers::{
    account_has_protected_state, enqueue_push, lookup_pending_location, revoke_devices_session,
    to_device_response,
};
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::Utc;
use db_rs::device;
use db_rs::sea_orm_active_enums::DeviceStatusEnum;
use notify_contracts::{PushContent, PushTarget};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
    QueryOrder,
};
use uuid::Uuid;

/// Registers (or refreshes) the caller's current device. Upserts by
/// `(user_id, public_key)`, not by session - the identity keypair is
/// persisted on-device and outlives session rotations, unlike the session
/// id itself. Called on every authenticated app launch, not just once.
#[utoipa::path(
    put,
    path = "/user/{user_id}/devices",
    tag = "Devices",
    params(("user_id" = String, Path, description = "Owner of the device")),
    request_body = MeDevicesSetRequest,
    responses(
        (status = 200, description = "Device registered", body = MeDevicesResponse),
        (status = 404, description = "Not your account")
    )
)]
pub async fn set_device(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
    headers: axum::http::HeaderMap,
    Json(body): Json<MeDevicesSetRequest>,
) -> impl IntoResponse {
    if let Err(status) = authorize_user_scope(&session, &user_id) {
        return status.into_response();
    }

    let device_type = body.device_type.into();

    let existing = device::Entity::find()
        .filter(device::Column::UserId.eq(user_id.clone()))
        .filter(device::Column::PublicKey.eq(body.public_key.clone()))
        .one(&state.db)
        .await
        .expect("failed to query device");

    let model = match existing {
        Some(model) => {
            // A device suspended by `create_recovery_request` or
            // `activate_via_recovery_key_mnemonic` re-announcing itself is
            // in exactly the same position as a brand-new device: it needs
            // to be trusted again before it can do anything. Routing it
            // back through the ordinary `Pending` machinery - sibling
            // approval, a fresh trusted-contacts recovery request, or the
            // recovery phrase, same as any new device - means there's no
            // separate "un-suspend" path to reason about, and no dead end
            // requiring another device to explicitly remove it first.
            let was_suspended = model.status == DeviceStatusEnum::Suspended;
            let device_id = model.id;
            let old_session_id = model.session_id.clone();
            // Only ever a different value here if this device genuinely
            // re-authenticated (OTP creates a new session id; the sliding-
            // expiry refresh this library also has never changes it) - see
            // `revoke_devices_session`'s own doc comment on why a *stale*
            // snapshot elsewhere can't be trusted to clean this up on its
            // own: the device's own re-registration is the one guaranteed
            // moment the old session is both known and safe to retire,
            // rather than leaving it to linger until some other device
            // happens to revoke this one later (by which point the snapshot
            // revoked there may itself already be stale).
            let session_rotated = old_session_id != session.session.id;

            let mut active = model.into_active_model();
            active.session_id = Set(session.session.id.clone());
            active.device_type = Set(device_type);
            active.updated_at = Set(Utc::now().into());
            if was_suspended {
                active.status = Set(DeviceStatusEnum::Pending);
                let (location_city, location_country) = lookup_pending_location(&state, &headers);
                active.location_city = Set(location_city);
                active.location_country = Set(location_country);
            }

            let (updated, ()) = tokio::join!(active.update(&state.db), async {
                if session_rotated {
                    revoke_devices_session(&state, &user_id, &old_session_id).await;
                }
            });
            let updated = updated.expect("failed to update device");

            if was_suspended {
                enqueue_push(
                    &state,
                    PushTarget::OtherActiveDevices {
                        user_id: user_id.clone(),
                        excluding_device_id: device_id.to_string(),
                    },
                    PushContent::DeviceApprovalRequested,
                )
                .await;
            }

            updated
        }
        None => {
            // Only the account's genuine first device skips straight to
            // `active` - every other new device waits for sibling/recovery
            // approval.
            let status = if account_has_protected_state(&state.db, &user_id).await {
                DeviceStatusEnum::Pending
            } else {
                DeviceStatusEnum::Active
            };

            // Only read for the pending case - nothing uses it once
            // approved (see `approve_device`, which nulls it out).
            let (location_city, location_country) = if status == DeviceStatusEnum::Pending {
                lookup_pending_location(&state, &headers)
            } else {
                (None, None)
            };

            let inserted = device::ActiveModel {
                id: Set(Uuid::new_v4()),
                user_id: Set(user_id.clone()),
                session_id: Set(session.session.id.clone()),
                public_key: Set(body.public_key),
                device_type: Set(device_type),
                status: Set(status),
                encrypted_dek: Set(None),
                location_city: Set(location_city),
                location_country: Set(location_country),
                created_at: Set(Utc::now().into()),
                updated_at: Set(Utc::now().into()),
            }
            .insert(&state.db)
            .await
            .expect("failed to create device");

            if status == DeviceStatusEnum::Pending {
                enqueue_push(
                    &state,
                    PushTarget::OtherActiveDevices {
                        user_id: user_id.clone(),
                        excluding_device_id: inserted.id.to_string(),
                    },
                    PushContent::DeviceApprovalRequested,
                )
                .await;
            }

            inserted
        }
    };

    let response = to_device_response(model);
    state.user_events_hub.publish(
        user_id,
        MeEventsUserEvent::DeviceRegistered(response.clone()),
    );

    Json(response).into_response()
}

#[utoipa::path(
    get,
    path = "/user/{user_id}/devices",
    tag = "Devices",
    params(("user_id" = String, Path, description = "Owner of the devices")),
    responses(
        (status = 200, description = "That account's registered devices", body = Vec<MeDevicesResponse>),
        (status = 404, description = "Not your account")
    )
)]
pub async fn list_devices(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
) -> impl IntoResponse {
    if let Err(status) = authorize_user_scope(&session, &user_id) {
        return status.into_response();
    }

    // Newest-first, matching the mobile client's optimistic prepend.
    let rows = device::Entity::find()
        .filter(device::Column::UserId.eq(user_id))
        .order_by_desc(device::Column::CreatedAt)
        .all(&state.db)
        .await
        .expect("failed to query devices");

    Json(rows.into_iter().map(to_device_response).collect::<Vec<_>>()).into_response()
}
