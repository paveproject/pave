use super::dto::{
    MeTrustedContactsAsContactQuery, MeTrustedContactsAsContactResponse,
    MeTrustedContactsGenerateInviteResponse, MeTrustedContactsRedeemInviteRequest,
    MeTrustedContactsResponse, MeTrustedContactsSetSharesRequest, TrustedContactStatus,
};
use crate::app::me::dto::{MeDeviceSummary, MeProfile};
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::app::me::recovery_requests::handlers as recovery_requests_handlers;
use crate::config::ApiConfig;
use crate::libs::media;
use crate::state::AppState;
use auth::schema::user as auth_user;
use auth::AppAuthSchema;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::{Duration, Utc};
use db_rs::device;
use db_rs::sea_orm_active_enums::{DeviceStatusEnum, TrustedContactStatusEnum};
use db_rs::trusted_contact;
use db_rs::trusted_contact_share;
use notify_contracts::{NotifyJob, PushContent, PushNotifyPayload, PushTarget};
use sea_orm::sea_query::{Expr, OnConflict};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

const INVITE_CODE_TTL_HOURS: i64 = 24;

fn generate_code() -> String {
    // 8 hex chars (32 bits of entropy) - no ambiguous O/0/I/1/L like base32.
    Uuid::new_v4().simple().to_string()[..8].to_uppercase()
}

fn hash_code(code: &str) -> String {
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

/// `GET`, not `POST`: deliberately not idempotent - every call rotates the
/// code, so the mobile client treats "my current invite" as a plain query
/// it can refetch/invalidate instead of juggling mutation state by hand.
#[utoipa::path(
    get,
    path = "/me/trusted-contacts/invite",
    tag = "TrustedContacts",
    responses((status = 200, description = "Current invite code - calling this again rotates it, shown once, share it out-of-band", body = MeTrustedContactsGenerateInviteResponse))
)]
pub async fn generate_invite(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let code = generate_code();
    let expires_at = Utc::now() + Duration::hours(INVITE_CODE_TTL_HOURS);

    // Upserts against `idx_trusted_contact_one_pending_invite_per_owner`
    // (the partial unique index enforcing "at most one pending invite" -
    // see `trustedContact.ts`) instead of delete-then-insert: one round
    // trip, no race window.
    let model = trusted_contact::Entity::insert(trusted_contact::ActiveModel {
        id: Set(Uuid::new_v4()),
        owner_user_id: Set(session.user.id.clone()),
        contact_user_id: Set(None),
        status: Set(TrustedContactStatusEnum::Pending),
        invite_code_hash: Set(hash_code(&code)),
        invite_code_expires_at: Set(expires_at.into()),
        created_at: Set(Utc::now().into()),
        updated_at: Set(Utc::now().into()),
    })
    .on_conflict(
        OnConflict::column(trusted_contact::Column::OwnerUserId)
            // Must be a literal matching the index predicate exactly -
            // Postgres won't infer a partial-index arbiter from a bound
            // parameter, even with an identical value.
            .target_and_where(Expr::cust("contact_user_id IS NULL AND status = 'pending'"))
            .update_columns([
                trusted_contact::Column::InviteCodeHash,
                trusted_contact::Column::InviteCodeExpiresAt,
                trusted_contact::Column::UpdatedAt,
            ])
            .to_owned(),
    )
    .exec_with_returning(&state.db)
    .await
    .expect("failed to upsert trusted contact invite");

    Json(MeTrustedContactsGenerateInviteResponse {
        id: model.id.to_string(),
        code,
        expires_at: expires_at.to_rfc3339(),
    })
    .into_response()
}

#[utoipa::path(
    post,
    path = "/me/trusted-contacts/redeem",
    tag = "TrustedContacts",
    request_body = MeTrustedContactsRedeemInviteRequest,
    responses(
        (status = 200, description = "Code redeemed - you're now this person's trusted contact", body = MeTrustedContactsAsContactResponse),
        (status = 400, description = "Invalid, expired, already-used code, or your own code")
    )
)]
pub async fn redeem_invite(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<MeTrustedContactsRedeemInviteRequest>,
) -> impl IntoResponse {
    let hash = hash_code(&body.code.trim().to_uppercase());

    let Some(model) = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::InviteCodeHash.eq(hash))
        .filter(trusted_contact::Column::Status.eq(TrustedContactStatusEnum::Pending))
        .one(&state.db)
        .await
        .expect("failed to query trusted contact invite")
    else {
        return (StatusCode::BAD_REQUEST, "invalid or expired code").into_response();
    };

    if model.invite_code_expires_at < Utc::now() {
        return (StatusCode::BAD_REQUEST, "invalid or expired code").into_response();
    }
    if model.owner_user_id == session.user.id {
        return (StatusCode::BAD_REQUEST, "you can't redeem your own code").into_response();
    }

    let invite_id = model.id;
    let owner_user_id = model.owner_user_id.clone();

    // Three independent lookups, resolved concurrently: the owner's
    // profile, any existing relationship to revive (see below), and the
    // contact's own devices (for the realtime event further down).
    let owner_profile_future = profiles_for(&state.db, vec![owner_user_id.clone()], &state.config);
    let existing_future = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::OwnerUserId.eq(owner_user_id.clone()))
        .filter(trusted_contact::Column::ContactUserId.eq(session.user.id.clone()))
        .filter(trusted_contact::Column::Id.ne(invite_id))
        .one(&state.db);
    let contact_devices_future = device_summaries_for(&state.db, &session.user.id);
    let (mut owner_profiles, existing, contact_devices) = tokio::join!(
        owner_profile_future,
        existing_future,
        contact_devices_future
    );
    let owner_profile = owner_profiles
        .remove(&owner_user_id)
        .expect("owner profile missing for a just-redeemed invite");
    let existing = existing.expect("failed to query existing trusted contact relationship");

    // A contact with existing history (revoked, then re-invited) would
    // collide with `unique_owner_contact` once `contact_user_id` is set -
    // revive that row instead, dropping this now-redundant invite
    // (deleted concurrently with the revive). Excludes this invite's own
    // id so a concurrent duplicate redeem never deletes the row it just
    // accepted.
    let updated = if let Some(existing) = existing {
        let mut active = existing.into_active_model();
        active.status = Set(TrustedContactStatusEnum::Accepted);
        active.updated_at = Set(Utc::now().into());
        let (updated, _) = tokio::try_join!(
            active.update(&state.db),
            trusted_contact::Entity::delete_by_id(invite_id).exec(&state.db)
        )
        .expect("failed to revive existing trusted contact relationship");
        updated
    } else {
        let mut active = model.into_active_model();
        active.contact_user_id = Set(Some(session.user.id.clone()));
        active.status = Set(TrustedContactStatusEnum::Accepted);
        active.updated_at = Set(Utc::now().into());
        active
            .update(&state.db)
            .await
            .expect("failed to accept trusted contact invite")
    };

    let contact_username = session
        .user
        .display_username
        .clone()
        .expect("display_username is NOT NULL in db");
    let contact_profile = MeProfile {
        id: session.user.id.clone(),
        username: contact_username.clone(),
        image: media::resolve_media_url(
            session.user.image.as_deref(),
            media::AVATARS_FOLDER,
            &state.config,
        ),
        devices: contact_devices,
    };
    state.user_events_hub.publish(
        owner_user_id.clone(),
        MeEventsUserEvent::TrustedContactAccepted(MeTrustedContactsResponse {
            id: updated.id.to_string(),
            status: TrustedContactStatus::Accepted,
            contact: Some(contact_profile),
            created_at: updated.created_at.to_rfc3339(),
        }),
    );

    let job = NotifyJob::PushNotification(PushNotifyPayload {
        target: PushTarget::Users {
            user_ids: vec![owner_user_id],
        },
        content: PushContent::TrustedContactAccepted {
            actor_username: Some(contact_username.clone()),
        },
    });
    state
        .notify_queue
        .add(job.name(), job.data(), None)
        .await
        .expect("failed to enqueue trusted-contact-accepted push");

    Json(MeTrustedContactsAsContactResponse {
        id: updated.id.to_string(),
        status: TrustedContactStatus::Accepted,
        owner: owner_profile,
        created_at: updated.created_at.to_rfc3339(),
        // Nothing contributed yet - sharing happens via a separate
        // `set_shares` call once the mobile client has computed it.
        encrypted_share: None,
    })
    .into_response()
}

#[utoipa::path(
    get,
    path = "/me/trusted-contacts",
    tag = "TrustedContacts",
    responses((status = 200, description = "Contacts you've designated", body = Vec<MeTrustedContactsResponse>))
)]
pub async fn list_trusted_contacts(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let rows = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::OwnerUserId.eq(session.user.id))
        .all(&state.db)
        .await
        .expect("failed to query trusted contacts");

    let contact_ids: Vec<String> = rows
        .iter()
        .filter_map(|r| r.contact_user_id.clone())
        .collect();
    let profiles = profiles_for(&state.db, contact_ids, &state.config).await;

    Json(
        rows.into_iter()
            .map(|row| MeTrustedContactsResponse {
                id: row.id.to_string(),
                status: row.status.into(),
                contact: row
                    .contact_user_id
                    .as_ref()
                    .and_then(|id| profiles.get(id).cloned()),
                created_at: row.created_at.to_rfc3339(),
            })
            .collect::<Vec<_>>(),
    )
    .into_response()
}

#[utoipa::path(
    get,
    path = "/me/trusted-contacts/as-contact",
    tag = "TrustedContacts",
    params(MeTrustedContactsAsContactQuery),
    responses((status = 200, description = "People whose safety net you're part of", body = Vec<MeTrustedContactsAsContactResponse>))
)]
pub async fn list_as_contact(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Query(query): Query<MeTrustedContactsAsContactQuery>,
) -> impl IntoResponse {
    let rows = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::ContactUserId.eq(session.user.id))
        .filter(trusted_contact::Column::Status.eq(TrustedContactStatusEnum::Accepted))
        .all(&state.db)
        .await
        .expect("failed to query trusted-by relationships");

    let owner_ids: Vec<String> = rows.iter().map(|r| r.owner_user_id.clone()).collect();
    let device_id = query
        .device_id
        .as_deref()
        .and_then(|id| Uuid::parse_str(id).ok());
    let trusted_contact_ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();

    // Independent of each other - run concurrently. Each row's one
    // relevant share (sealed for *this* device specifically) lives in
    // `trusted_contact_share`, not a column on `trusted_contact` itself,
    // resolved in one batched query keyed by relationship id.
    let profiles_future = profiles_for(&state.db, owner_ids, &state.config);
    let shares_future = async {
        match device_id {
            Some(device_id) => trusted_contact_share::Entity::find()
                .filter(trusted_contact_share::Column::TrustedContactId.is_in(trusted_contact_ids))
                .filter(trusted_contact_share::Column::DeviceId.eq(device_id))
                .all(&state.db)
                .await
                .expect("failed to query trusted contact shares"),
            None => Vec::new(),
        }
    };
    let (profiles, share_rows) = tokio::join!(profiles_future, shares_future);
    let mut shares_by_trusted_contact: HashMap<Uuid, String> = share_rows
        .into_iter()
        .map(|row| (row.trusted_contact_id, row.encrypted_share))
        .collect();

    Json(
        rows.into_iter()
            .map(|row| MeTrustedContactsAsContactResponse {
                encrypted_share: shares_by_trusted_contact.remove(&row.id),
                id: row.id.to_string(),
                status: row.status.into(),
                owner: profiles
                    .get(&row.owner_user_id)
                    .cloned()
                    .expect("owner profile missing for an accepted trusted-contact row"),
                created_at: row.created_at.to_rfc3339(),
            })
            .collect::<Vec<_>>(),
    )
    .into_response()
}

#[utoipa::path(
    delete,
    path = "/me/trusted-contacts/{id}",
    tag = "TrustedContacts",
    params(("id" = Uuid, Path, description = "Trusted contact relationship id")),
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

/// Called once per recovery-key rotation (see `trustedContactShare`'s own
/// doc comment in `libs/db`) with every accepted contact device's new
/// share together, not once per device - keeps a rotation atomic-ish from
/// the client's point of view and avoids N round trips.
#[utoipa::path(
    put,
    path = "/me/trusted-contacts/shares",
    tag = "TrustedContacts",
    request_body = MeTrustedContactsSetSharesRequest,
    responses(
        (status = 200, description = "Shares updated"),
        (status = 400, description = "One of the ids isn't a trusted contact you own, or one of the devices doesn't belong to that contact")
    )
)]
pub async fn set_shares(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<MeTrustedContactsSetSharesRequest>,
) -> impl IntoResponse {
    let owner_id = session.user.id.clone();

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
