use super::dto::{MeDevicesResponse, MeDevicesSetDekRequest, MeDevicesSetRequest};
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::libs::entities::device;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, ModelTrait,
    QueryFilter,
};
use uuid::Uuid;

fn to_device_response(model: device::Model) -> MeDevicesResponse {
    MeDevicesResponse {
        id: model.id.to_string(),
        public_key: model.public_key,
        device_type: model.device_type.into(),
        encrypted_dek: model.encrypted_dek,
        created_at: model.created_at.to_rfc3339(),
        updated_at: model.updated_at.to_rfc3339(),
    }
}

/// Registers (or refreshes) the caller's current device. Upserts by
/// `(user_id, public_key)`, not by session - the identity keypair this
/// public key belongs to is generated once and persisted in
/// `expo-secure-store` on the mobile side, so it stays constant across
/// session rotations (re-login, token refresh) the way the session id
/// itself doesn't. Keying on the session instead would mint a new,
/// orphaned row on every re-login, which would quietly defeat device
/// revocation (the stale rows would keep receiving future updates).
///
/// Called unconditionally on every app launch while authenticated (not
/// only the first time a keypair is generated) - same reasoning as
/// `push_token::handlers::set_push_token`, which also always re-upserts.
#[utoipa::path(
    put,
    path = "/me/devices",
    tag = "Me",
    request_body = MeDevicesSetRequest,
    responses((status = 200, description = "Device registered", body = MeDevicesResponse))
)]
pub async fn set_device(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<MeDevicesSetRequest>,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();
    let device_type = body.device_type.into();

    let existing = device::Entity::find()
        .filter(device::Column::UserId.eq(user_id.clone()))
        .filter(device::Column::PublicKey.eq(body.public_key.clone()))
        .one(&state.db)
        .await
        .expect("failed to query device");

    let model = match existing {
        Some(model) => {
            let mut active = model.into_active_model();
            active.session_id = Set(session.session.id.clone());
            active.device_type = Set(device_type);
            active.updated_at = Set(Utc::now().into());
            active
                .update(&state.db)
                .await
                .expect("failed to update device")
        }
        None => device::ActiveModel {
            id: Set(Uuid::new_v4()),
            user_id: Set(user_id.clone()),
            session_id: Set(session.session.id.clone()),
            public_key: Set(body.public_key),
            device_type: Set(device_type),
            encrypted_dek: Set(None),
            created_at: Set(Utc::now().into()),
            updated_at: Set(Utc::now().into()),
        }
        .insert(&state.db)
        .await
        .expect("failed to create device"),
    };

    let response = to_device_response(model);
    state.user_events_hub.publish(
        user_id,
        MeEventsUserEvent::DeviceRegistered(response.clone()),
    );

    Json(response)
}

#[utoipa::path(
    get,
    path = "/me/devices",
    tag = "Me",
    responses((status = 200, description = "The caller's own registered devices", body = Vec<MeDevicesResponse>))
)]
pub async fn list_devices(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let rows = device::Entity::find()
        .filter(device::Column::UserId.eq(session.user.id))
        .all(&state.db)
        .await
        .expect("failed to query devices");

    Json(rows.into_iter().map(to_device_response).collect::<Vec<_>>())
}

#[utoipa::path(
    delete,
    path = "/me/devices/{id}",
    tag = "Me",
    params(("id" = Uuid, Path, description = "Device id")),
    responses(
        (status = 200, description = "Revoked"),
        (status = 404, description = "Not found, or not yours to revoke")
    )
)]
pub async fn revoke_device(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let Some(model) = device::Entity::find_by_id(id)
        .filter(device::Column::UserId.eq(session.user.id))
        .one(&state.db)
        .await
        .expect("failed to query device")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    // Hard delete, unlike `trusted_contact`'s soft `Revoked` status -
    // nothing reads a device's history, and the FK cascade on
    // `trusted_contact_share`/dependents cleans up on its own.
    model
        .delete(&state.db)
        .await
        .expect("failed to revoke device");

    StatusCode::OK.into_response()
}

/// Deposits a sealed copy of the caller's own current recovery key for
/// one of their *other* devices - both the caller and the target `{id}`
/// must belong to the same user. No Shamir split involved (this is
/// "you, trusting yourself", not a quorum problem) - just a direct seal
/// to that device's public key, opaque to the server.
#[utoipa::path(
    put,
    path = "/me/devices/{id}/dek",
    tag = "Me",
    params(("id" = Uuid, Path, description = "Target device id")),
    request_body = MeDevicesSetDekRequest,
    responses(
        (status = 200, description = "Recovery key copy deposited"),
        (status = 404, description = "Not found, or not yours")
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

    state.user_events_hub.publish(
        user_id,
        MeEventsUserEvent::DeviceDekUpdated(to_device_response(updated)),
    );

    StatusCode::OK.into_response()
}
