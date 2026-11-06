use crate::app::access::authorize_user_scope;
use crate::app::me::dto::MeProfile;
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::app::trusted_contacts::dto::{
    MeTrustedContactsAsContactResponse, MeTrustedContactsSetSharesRequest,
};
use crate::app::trusted_contacts::handlers::device_summaries_for;
use crate::libs::media;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::Utc;
use db_rs::device;
use db_rs::trusted_contact;
use db_rs::trusted_contact_share;
use sea_orm::sea_query::OnConflict;
use sea_orm::{ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

/// Called once per recovery-key rotation (see `trustedContactShare`'s own
/// doc comment in `libs/db`) with every accepted contact device's new
/// share together, not once per device - keeps a rotation atomic-ish from
/// the client's point of view and avoids N round trips.
#[utoipa::path(
    put,
    path = "/user/{user_id}/trusted-contact/shares",
    tag = "TrustedContacts",
    params(("user_id" = String, Path, description = "Account whose shares to set")),
    request_body = MeTrustedContactsSetSharesRequest,
    responses(
        (status = 200, description = "Shares updated"),
        (status = 400, description = "One of the ids isn't a trusted contact you own, or one of the devices doesn't belong to that contact"),
        (status = 404, description = "Not your account")
    )
)]
pub async fn set_shares(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
    Json(body): Json<MeTrustedContactsSetSharesRequest>,
) -> impl IntoResponse {
    if let Err(status) = authorize_user_scope(&session, &user_id) {
        return status.into_response();
    }

    let owner_id = user_id;

    struct Upload {
        trusted_contact_id: Uuid,
        device_id: Uuid,
        encrypted_share: String,
    }

    let mut uploads = Vec::with_capacity(body.shares.len());
    for share in body.shares {
        let (Ok(trusted_contact_id), Ok(device_id)) = (
            Uuid::parse_str(&share.trusted_contact_id),
            Uuid::parse_str(&share.device_id),
        ) else {
            return (
                StatusCode::BAD_REQUEST,
                "invalid trusted contact or device id",
            )
                .into_response();
        };
        uploads.push(Upload {
            trusted_contact_id,
            device_id,
            encrypted_share: share.encrypted_share,
        });
    }

    let trusted_contact_ids: HashSet<Uuid> = uploads.iter().map(|u| u.trusted_contact_id).collect();
    let device_ids: HashSet<Uuid> = uploads.iter().map(|u| u.device_id).collect();

    // Three independent lookups, resolved concurrently: the trusted
    // contacts/devices validated below, and the owner's own devices
    // (only needed for the notification built after validation).
    let trusted_contacts_future = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::Id.is_in(trusted_contact_ids.iter().copied()))
        .filter(trusted_contact::Column::OwnerUserId.eq(owner_id.clone()))
        .all(&state.db);
    let devices_future = device::Entity::find()
        .filter(device::Column::Id.is_in(device_ids.iter().copied()))
        .all(&state.db);
    let owner_devices_future = device_summaries_for(&state.db, &owner_id);
    let (trusted_contacts, devices, owner_devices) = tokio::join!(
        trusted_contacts_future,
        devices_future,
        owner_devices_future
    );

    let trusted_contacts: HashMap<Uuid, trusted_contact::Model> = trusted_contacts
        .expect("failed to query trusted contacts for share update")
        .into_iter()
        .map(|row| (row.id, row))
        .collect();
    if trusted_contacts.len() != trusted_contact_ids.len() {
        return (
            StatusCode::BAD_REQUEST,
            "one of the ids isn't a trusted contact you own",
        )
            .into_response();
    }
    let devices: HashMap<Uuid, device::Model> = devices
        .expect("failed to query devices for share update")
        .into_iter()
        .map(|row| (row.id, row))
        .collect();

    for upload in &uploads {
        let Some(device) = devices.get(&upload.device_id) else {
            return (
                StatusCode::BAD_REQUEST,
                "one of the device ids doesn't exist",
            )
                .into_response();
        };
        let trusted_contact = &trusted_contacts[&upload.trusted_contact_id];
        if trusted_contact.contact_user_id.as_deref() != Some(device.user_id.as_str()) {
            return (
                StatusCode::BAD_REQUEST,
                "one of the devices doesn't belong to that contact",
            )
                .into_response();
        }
    }

    let owner_profile = MeProfile {
        id: owner_id,
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

    // One batched upsert instead of a find-then-write loop (2 round trips
    // per upload). A conflicting row keeps its own `id`/`created_at`.
    let now = Utc::now();
    let models = uploads
        .iter()
        .map(|upload| trusted_contact_share::ActiveModel {
            id: Set(Uuid::new_v4()),
            trusted_contact_id: Set(upload.trusted_contact_id),
            device_id: Set(upload.device_id),
            encrypted_share: Set(upload.encrypted_share.clone()),
            created_at: Set(now.into()),
            updated_at: Set(now.into()),
        })
        .collect::<Vec<_>>();
    trusted_contact_share::Entity::insert_many(models)
        .on_conflict(
            OnConflict::columns([
                trusted_contact_share::Column::TrustedContactId,
                trusted_contact_share::Column::DeviceId,
            ])
            .update_columns([
                trusted_contact_share::Column::EncryptedShare,
                trusted_contact_share::Column::UpdatedAt,
            ])
            .to_owned(),
        )
        .exec(&state.db)
        .await
        .expect("failed to upsert trusted contact shares");

    for upload in uploads {
        // Only a genuinely accepted relationship has a contact to notify -
        // nothing else can have reached this point anyway, since an
        // owner's reconciliation only ever splits shares for contacts it
        // already sees as accepted, but this stays defensive rather than
        // assuming that invariant held on the caller's side too.
        let trusted_contact = &trusted_contacts[&upload.trusted_contact_id];
        if let Some(contact_user_id) = trusted_contact.contact_user_id.clone() {
            state.user_events_hub.publish(
                contact_user_id,
                MeEventsUserEvent::TrustedContactShareUpdated(MeTrustedContactsAsContactResponse {
                    id: trusted_contact.id.to_string(),
                    status: trusted_contact.status.into(),
                    owner: owner_profile.clone(),
                    created_at: trusted_contact.created_at.to_rfc3339(),
                    encrypted_share: Some(upload.encrypted_share),
                }),
            );
        }
    }

    StatusCode::OK.into_response()
}
