use super::dto::{
    AsContactQuery, GenerateInviteResponse, RedeemInviteRequest, SetSharesRequest,
    TrustedByResponse, TrustedContactResponse, TrustedContactStatus,
};
use crate::app::me::dto::{DeviceSummary, Profile};
use crate::app::me::events::ws_dto::UserEvent;
use crate::config::ApiConfig;
use crate::libs::entities::device;
use crate::libs::entities::sea_orm_active_enums::TrustedContactStatusEnum;
use crate::libs::entities::trusted_contact;
use crate::libs::entities::trusted_contact_share;
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
use notify_contracts::{Lang, NotifyJob, PushContent, PushNotificationPayload, PushProvider};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use uuid::Uuid;

const INVITE_CODE_TTL_HOURS: i64 = 24;

fn generate_code() -> String {
    // 8 hex chars (32 bits of entropy) from a fresh v4 UUID - hex avoids
    // visually ambiguous characters (no O/0/I/1/L confusion, unlike some
    // base32 alphabets) without pulling in a new dependency for this.
    Uuid::new_v4().simple().to_string()[..8].to_uppercase()
}

fn hash_code(code: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(code.as_bytes());
    hex::encode(hasher.finalize())
}

/// One user's registered devices, as `DeviceSummary`s (id + public key
/// only - see its own doc comment) - every device gets its own sealed
/// copy of whatever's meant for that user (a Shamir share, as a contact;
/// a full recovery-key copy, as a sibling device), keyed on the device
/// id, so callers always need the whole list, never a single key.
pub(crate) async fn device_summaries_for(
    db: &sea_orm::DatabaseConnection,
    user_id: &str,
) -> Vec<DeviceSummary> {
    device::Entity::find()
        .filter(device::Column::UserId.eq(user_id.to_string()))
        .all(db)
        .await
        .expect("failed to query devices")
        .into_iter()
        .map(|row| DeviceSummary {
            id: row.id.to_string(),
            public_key: row.public_key,
        })
        .collect()
}

/// Batch-fetches a minimal public `Profile` for a set of user ids - avoids
/// N+1 queries when listing several trusted-contact rows at once.
///
/// Two queries, not a join: `username`/`image` live on better-auth's own
/// `auth.users` table, devices on Pave's own `device` table (see
/// `libs/entities/device.rs`) - the two are only ever joined in
/// application code, never in SQL, elsewhere in this codebase either.
pub(crate) async fn profiles_for(
    db: &sea_orm::DatabaseConnection,
    user_ids: Vec<String>,
    config: &ApiConfig,
) -> HashMap<String, Profile> {
    if user_ids.is_empty() {
        return HashMap::new();
    }

    let mut devices: HashMap<String, Vec<DeviceSummary>> = HashMap::new();
    for row in device::Entity::find()
        .filter(device::Column::UserId.is_in(user_ids.clone()))
        .all(db)
        .await
        .expect("failed to query device rows")
    {
        devices
            .entry(row.user_id.clone())
            .or_default()
            .push(DeviceSummary {
                id: row.id.to_string(),
                public_key: row.public_key,
            });
    }

    auth_user::Entity::find()
        .filter(auth_user::Column::Id.is_in(user_ids))
        .all(db)
        .await
        .expect("failed to query profiles")
        .into_iter()
        .map(|row| {
            let devices = devices.remove(&row.id).unwrap_or_default();
            (
                row.id.clone(),
                Profile {
                    id: row.id,
                    username: row.username,
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
/// code (see the "at most one pending invite" cleanup below), so the
/// mobile client treats "my current invite" as a plain query it can
/// refetch/invalidate (e.g. the instant its `trusted_contact_accepted`
/// event fires) instead of juggling mutation state by hand.
#[utoipa::path(
    get,
    path = "/me/trusted-contacts/invite",
    tag = "TrustedContacts",
    responses((status = 200, description = "Current invite code - calling this again rotates it, shown once, share it out-of-band", body = GenerateInviteResponse))
)]
pub async fn generate_invite(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let code = generate_code();
    let expires_at = Utc::now() + Duration::hours(INVITE_CODE_TTL_HOURS);

    // At most one unredeemed invite per owner - generating a new one makes
    // any previously shared (but never scanned) code stop working, instead
    // of piling up dead "pending" rows every time "add" is tapped.
    trusted_contact::Entity::delete_many()
        .filter(trusted_contact::Column::OwnerUserId.eq(session.user.id.clone()))
        .filter(trusted_contact::Column::ContactUserId.is_null())
        .filter(trusted_contact::Column::Status.eq(TrustedContactStatusEnum::Pending))
        .exec(&state.db)
        .await
        .expect("failed to clear previous pending invites");

    let id = Uuid::new_v4();
    trusted_contact::ActiveModel {
        id: Set(id),
        owner_user_id: Set(session.user.id.clone()),
        contact_user_id: Set(None),
        status: Set(TrustedContactStatusEnum::Pending),
        invite_code_hash: Set(hash_code(&code)),
        invite_code_expires_at: Set(expires_at.into()),
        created_at: Set(Utc::now().into()),
        updated_at: Set(Utc::now().into()),
    }
    .insert(&state.db)
    .await
    .expect("failed to create trusted contact invite");

    Json(GenerateInviteResponse {
        id: id.to_string(),
        code,
        expires_at: expires_at.to_rfc3339(),
    })
    .into_response()
}

#[utoipa::path(
    post,
    path = "/me/trusted-contacts/redeem",
    tag = "TrustedContacts",
    request_body = RedeemInviteRequest,
    responses(
        (status = 200, description = "Code redeemed - you're now this person's trusted contact"),
        (status = 400, description = "Invalid, expired, already-used code, or your own code")
    )
)]
pub async fn redeem_invite(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<RedeemInviteRequest>,
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

    // A contact who already has history with this owner (most commonly:
    // was revoked, then re-invited) would otherwise collide with the
    // `unique_owner_contact` constraint the instant this invite's
    // `contact_user_id` gets set - revive that existing row instead of
    // creating a second one for the same pair, and drop this now-redundant
    // invite. Excludes this invite's own id: a concurrent duplicate
    // request for the same code (e.g. the camera firing `onBarcodeScanned`
    // more than once before the first redeem commits) must never see
    // itself here and try to delete the very row it just accepted.
    let existing = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::OwnerUserId.eq(owner_user_id.clone()))
        .filter(trusted_contact::Column::ContactUserId.eq(session.user.id.clone()))
        .filter(trusted_contact::Column::Id.ne(invite_id))
        .one(&state.db)
        .await
        .expect("failed to query existing trusted contact relationship");

    let updated = if let Some(existing) = existing {
        let mut active = existing.into_active_model();
        active.status = Set(TrustedContactStatusEnum::Accepted);
        active.updated_at = Set(Utc::now().into());
        let updated = active
            .update(&state.db)
            .await
            .expect("failed to revive existing trusted contact relationship");

        trusted_contact::Entity::delete_by_id(invite_id)
            .exec(&state.db)
            .await
            .expect("failed to clean up redundant invite row");

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

    let contact_username = session.user.username.clone();

    // Almost everything below is already in hand from the update above and
    // the caller's own session - no extra query, whether or not the owner
    // is actually connected to `/me/ws` right now (see `ws_dto::UserEvent`'s
    // own doc comment on why that matters). The contact's devices are the
    // one exception: they live on Pave's own `device` table, not
    // better-auth's session, so the owner can seal a share to each of them
    // the instant they see this event instead of waiting on a separate
    // list refetch.
    let contact_devices = device_summaries_for(&state.db, &session.user.id).await;
    let contact_profile = Profile {
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
        UserEvent::TrustedContactAccepted(TrustedContactResponse {
            id: updated.id.to_string(),
            status: TrustedContactStatus::Accepted,
            contact: Some(contact_profile),
            created_at: updated.created_at.to_rfc3339(),
        }),
    );

    let owner_row = crate::app::me::handlers::ensure_pave_user_row(&state.db, &owner_user_id).await;
    let owner_lang = match owner_row.language.as_str() {
        "fr" => Lang::Fr,
        _ => Lang::En,
    };

    let push_tokens = crate::libs::entities::push_token::Entity::find()
        .filter(crate::libs::entities::push_token::Column::UserId.eq(owner_user_id))
        .all(&state.db)
        .await
        .expect("failed to query owner's push tokens");

    for token in push_tokens {
        let provider = match token.provider {
            crate::libs::entities::sea_orm_active_enums::PushProviderEnum::Fcm => PushProvider::Fcm,
            crate::libs::entities::sea_orm_active_enums::PushProviderEnum::Apns => {
                PushProvider::Apns
            }
        };
        let job = NotifyJob::PushNotification(PushNotificationPayload {
            provider,
            token: token.token,
            lang: owner_lang,
            content: PushContent::TrustedContactAccepted {
                actor_username: contact_username.clone(),
            },
            data: serde_json::json!({ "type": "trusted_contact:accepted" }),
        });
        state
            .notify_queue
            .add(job.name(), job.data(), None)
            .await
            .expect("failed to enqueue trusted-contact-accepted push");
    }

    StatusCode::OK.into_response()
}

#[utoipa::path(
    get,
    path = "/me/trusted-contacts",
    tag = "TrustedContacts",
    responses((status = 200, description = "Contacts you've designated", body = Vec<TrustedContactResponse>))
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
            .map(|row| TrustedContactResponse {
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
    params(AsContactQuery),
    responses((status = 200, description = "People whose safety net you're part of", body = Vec<TrustedByResponse>))
)]
pub async fn list_as_contact(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Query(query): Query<AsContactQuery>,
) -> impl IntoResponse {
    let rows = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::ContactUserId.eq(session.user.id))
        .filter(trusted_contact::Column::Status.eq(TrustedContactStatusEnum::Accepted))
        .all(&state.db)
        .await
        .expect("failed to query trusted-by relationships");

    let owner_ids: Vec<String> = rows.iter().map(|r| r.owner_user_id.clone()).collect();
    let profiles = profiles_for(&state.db, owner_ids, &state.config).await;

    // Each row's one relevant share (sealed for *this* device specifically)
    // lives in `trusted_contact_share`, not a column on `trusted_contact`
    // itself - resolved in one batched query, keyed by relationship id.
    let mut shares_by_trusted_contact: HashMap<Uuid, String> = HashMap::new();
    if let Some(device_id) = query
        .device_id
        .as_deref()
        .and_then(|id| Uuid::parse_str(id).ok())
    {
        let trusted_contact_ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();
        shares_by_trusted_contact = trusted_contact_share::Entity::find()
            .filter(trusted_contact_share::Column::TrustedContactId.is_in(trusted_contact_ids))
            .filter(trusted_contact_share::Column::DeviceId.eq(device_id))
            .all(&state.db)
            .await
            .expect("failed to query trusted contact shares")
            .into_iter()
            .map(|row| (row.trusted_contact_id, row.encrypted_share))
            .collect();
    }

    Json(
        rows.into_iter()
            .map(|row| TrustedByResponse {
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

    let mut active = model.into_active_model();
    active.status = Set(TrustedContactStatusEnum::Revoked);
    active.updated_at = Set(Utc::now().into());
    let updated = active
        .update(&state.db)
        .await
        .expect("failed to revoke trusted contact");

    // Only a genuinely accepted relationship has a contact to notify -
    // nothing else can have reached this point with a `contact_user_id` set.
    if let Some(contact_user_id) = contact_user_id {
        let owner_devices = device_summaries_for(&state.db, &session.user.id).await;
        let owner_profile = Profile {
            id: session.user.id,
            username: session.user.username,
            image: media::resolve_media_url(
                session.user.image.as_deref(),
                media::AVATARS_FOLDER,
                &state.config,
            ),
            devices: owner_devices,
        };

        state.user_events_hub.publish(
            contact_user_id,
            UserEvent::TrustedContactRevoked(TrustedByResponse {
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
    request_body = SetSharesRequest,
    responses(
        (status = 200, description = "Shares updated"),
        (status = 400, description = "One of the ids isn't a trusted contact you own, or one of the devices doesn't belong to that contact")
    )
)]
pub async fn set_shares(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<SetSharesRequest>,
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
    let trusted_contacts: HashMap<Uuid, trusted_contact::Model> = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::Id.is_in(trusted_contact_ids.iter().copied()))
        .filter(trusted_contact::Column::OwnerUserId.eq(owner_id.clone()))
        .all(&state.db)
        .await
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

    let device_ids: HashSet<Uuid> = uploads.iter().map(|u| u.device_id).collect();
    let devices: HashMap<Uuid, device::Model> = device::Entity::find()
        .filter(device::Column::Id.is_in(device_ids.iter().copied()))
        .all(&state.db)
        .await
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

    let owner_devices = device_summaries_for(&state.db, &owner_id).await;
    let owner_profile = Profile {
        id: owner_id,
        username: session.user.username,
        image: media::resolve_media_url(
            session.user.image.as_deref(),
            media::AVATARS_FOLDER,
            &state.config,
        ),
        devices: owner_devices,
    };

    for upload in uploads {
        let existing = trusted_contact_share::Entity::find()
            .filter(trusted_contact_share::Column::TrustedContactId.eq(upload.trusted_contact_id))
            .filter(trusted_contact_share::Column::DeviceId.eq(upload.device_id))
            .one(&state.db)
            .await
            .expect("failed to query trusted contact share");

        let updated = match existing {
            Some(model) => {
                let mut active = model.into_active_model();
                active.encrypted_share = Set(upload.encrypted_share);
                active.updated_at = Set(Utc::now().into());
                active
                    .update(&state.db)
                    .await
                    .expect("failed to update trusted contact share")
            }
            None => trusted_contact_share::ActiveModel {
                id: Set(Uuid::new_v4()),
                trusted_contact_id: Set(upload.trusted_contact_id),
                device_id: Set(upload.device_id),
                encrypted_share: Set(upload.encrypted_share),
                created_at: Set(Utc::now().into()),
                updated_at: Set(Utc::now().into()),
            }
            .insert(&state.db)
            .await
            .expect("failed to create trusted contact share"),
        };

        // Only a genuinely accepted relationship has a contact to notify -
        // nothing else can have reached this point anyway, since an
        // owner's reconciliation only ever splits shares for contacts it
        // already sees as accepted, but this stays defensive rather than
        // assuming that invariant held on the caller's side too.
        let trusted_contact = &trusted_contacts[&upload.trusted_contact_id];
        if let Some(contact_user_id) = trusted_contact.contact_user_id.clone() {
            state.user_events_hub.publish(
                contact_user_id,
                UserEvent::TrustedContactShareUpdated(TrustedByResponse {
                    id: trusted_contact.id.to_string(),
                    status: trusted_contact.status.into(),
                    owner: owner_profile.clone(),
                    created_at: trusted_contact.created_at.to_rfc3339(),
                    encrypted_share: Some(updated.encrypted_share),
                }),
            );
        }
    }

    StatusCode::OK.into_response()
}
