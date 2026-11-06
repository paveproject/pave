use super::dto::MeTrustedContactsAsContactResponse;
use crate::app::me::dto::{MeDeviceSummary, MeProfile};
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::app::recovery_requests::handlers as recovery_requests_handlers;
use crate::config::ApiConfig;
use crate::libs::media;
use crate::state::AppState;
use auth::schema::user as auth_user;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use better_auth::integrations::axum::CurrentSession;
use chrono::Utc;
use db_rs::device;
use db_rs::sea_orm_active_enums::{DeviceStatusEnum, TrustedContactStatusEnum};
use db_rs::trusted_contact;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use uuid::Uuid;

pub(crate) const INVITE_CODE_TTL_HOURS: i64 = 24;

pub(crate) fn generate_code() -> String {
    // 8 hex chars (32 bits of entropy) - no ambiguous O/0/I/1/L like base32.
    Uuid::new_v4().simple().to_string()[..8].to_uppercase()
}

pub(crate) fn hash_code(code: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(code.as_bytes());
    hex::encode(hasher.finalize())
}

/// `active` only - a `pending` device hasn't been approved yet, and
/// including it here would hand it a share/DEK copy before that.
pub(crate) async fn device_summaries_for(
    db: &sea_orm::DatabaseConnection,
    user_id: &str,
) -> Vec<MeDeviceSummary> {
    device::Entity::find()
        .filter(device::Column::UserId.eq(user_id.to_string()))
        .filter(device::Column::Status.eq(DeviceStatusEnum::Active))
        .all(db)
        .await
        .expect("failed to query devices")
        .into_iter()
        .map(|row| MeDeviceSummary {
            id: row.id.to_string(),
            public_key: row.public_key,
        })
        .collect()
}

/// Batch-fetches a minimal public `MeProfile` for a set of user ids - avoids
/// N+1 queries when listing several trusted-contact rows at once. Two
/// queries, not a join (`username`/`image` live on better-auth's own
/// `auth.users` table, devices on Pave's own `device` table), run
/// concurrently since neither depends on the other.
pub(crate) async fn profiles_for(
    db: &sea_orm::DatabaseConnection,
    user_ids: Vec<String>,
    config: &ApiConfig,
) -> HashMap<String, MeProfile> {
    if user_ids.is_empty() {
        return HashMap::new();
    }

    let device_rows = device::Entity::find()
        .filter(device::Column::UserId.is_in(user_ids.clone()))
        .filter(device::Column::Status.eq(DeviceStatusEnum::Active))
        .all(db);
    let user_rows = auth_user::Entity::find()
        .filter(auth_user::Column::Id.is_in(user_ids))
        .all(db);
    let (device_rows, user_rows) =
        tokio::try_join!(device_rows, user_rows).expect("failed to query profiles");

    let mut devices: HashMap<String, Vec<MeDeviceSummary>> = HashMap::new();
    for row in device_rows {
        devices
            .entry(row.user_id.clone())
            .or_default()
            .push(MeDeviceSummary {
                id: row.id.to_string(),
                public_key: row.public_key,
            });
    }

    user_rows
        .into_iter()
        .map(|row| {
            let devices = devices.remove(&row.id).unwrap_or_default();
            (
                row.id.clone(),
                MeProfile {
                    id: row.id,
                    username: row
                        .display_username
                        .expect("display_username is NOT NULL in db"),
                    image: media::resolve_media_url(
                        row.image.as_deref(),
                        media::AVATARS_FOLDER,
                        config,
                    ),
                    devices,
                },
            )
        })
        .collect()
}

#[utoipa::path(
    delete,
    path = "/trusted-contact/{trusted_contact_id}",
    tag = "TrustedContacts",
    params(("trusted_contact_id" = Uuid, Path, description = "Trusted contact relationship id")),
    responses(
        (status = 200, description = "Revoked"),
        (status = 404, description = "Not found, or not yours to revoke")
    )
)]
pub async fn revoke_trusted_contact(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
) -> impl IntoResponse {
    let Some(model) = trusted_contact::Entity::find_by_id(id)
        .filter(trusted_contact::Column::OwnerUserId.eq(session.user.id.clone()))
        .one(&state.db)
        .await
        .expect("failed to query trusted contact")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let contact_user_id = model.contact_user_id.clone();
    let trusted_contact_id = model.id;

    let mut active = model.into_active_model();
    active.status = Set(TrustedContactStatusEnum::Revoked);
    active.updated_at = Set(Utc::now().into());

    // Independent of each other: the update itself, withdrawing any
    // standing ask on an in-flight recovery request (can't recall an
    // already-sealed share, but can pull back the request), and the
    // owner's devices (only needed below, if there's a contact to notify).
    let (updated, (), owner_devices) = tokio::join!(
        active.update(&state.db),
        recovery_requests_handlers::decline_pending_response_on_revoke(&state, trusted_contact_id,),
        device_summaries_for(&state.db, &session.user.id),
    );
    let updated = updated.expect("failed to revoke trusted contact");

    // Only a genuinely accepted relationship has a contact to notify -
    // nothing else can have reached this point with a `contact_user_id` set.
    if let Some(contact_user_id) = contact_user_id {
        let owner_profile = MeProfile {
            id: session.user.id,
            username: session
                .user
                .display_username
                .expect("display_username is NOT NULL in db"),
            image: media::resolve_media_url(
                session.user.image.as_deref(),
                media::AVATARS_FOLDER,
                &state.config,
            ),
            devices: owner_devices,
        };

        state.user_events_hub.publish(
            contact_user_id,
            MeEventsUserEvent::TrustedContactRevoked(MeTrustedContactsAsContactResponse {
                id: updated.id.to_string(),
                status: updated.status.into(),
                owner: owner_profile,
                created_at: updated.created_at.to_rfc3339(),
                // No specific device to resolve to here - the contact's
                // own cache removal (see `useUserEventsSocket`) doesn't
                // read this field, it just drops the row entirely.
                encrypted_share: None,
            }),
        );
    }

    StatusCode::OK.into_response()
}
