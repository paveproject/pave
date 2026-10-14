use super::dto::{
    GenerateInviteResponse, RedeemInviteRequest, TrustedByResponse, TrustedContactResponse,
    TrustedContactStatus,
};
use crate::app::me::dto::Profile;
use crate::app::me::events::ws_dto::UserEvent;
use crate::config::ApiConfig;
use crate::libs::entities::sea_orm_active_enums::TrustedContactStatusEnum;
use crate::libs::entities::trusted_contact;
use crate::libs::media;
use crate::state::AppState;
use auth::schema::user as auth_user;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::{Duration, Utc};
use notify_contracts::{NotifyJob, PushNotificationPayload, PushProvider};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
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

/// Batch-fetches a minimal public `Profile` for a set of user ids - avoids
/// N+1 queries when listing several trusted-contact rows at once.
async fn profiles_for(
    db: &sea_orm::DatabaseConnection,
    user_ids: Vec<String>,
    config: &ApiConfig,
) -> HashMap<String, Profile> {
    if user_ids.is_empty() {
        return HashMap::new();
    }
    auth_user::Entity::find()
        .filter(auth_user::Column::Id.is_in(user_ids))
        .all(db)
        .await
        .expect("failed to query profiles")
        .into_iter()
        .map(|row| {
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

    // Everything below is already in hand from the update above and the
    // caller's own session - no extra query, whether or not the owner is
    // actually connected to `/me/ws` right now (see `ws_dto::UserEvent`'s
    // own doc comment on why that matters).
    let contact_profile = Profile {
        id: session.user.id.clone(),
        username: contact_username.clone(),
        image: media::resolve_media_url(
            session.user.image.as_deref(),
            media::AVATARS_FOLDER,
            &state.config,
        ),
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
            title: "Pavé".to_string(),
            body: format!(
                "{} a accepté votre invitation de contact de confiance",
                contact_username
                    .clone()
                    .unwrap_or_else(|| "Quelqu'un".to_string())
            ),
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
    responses((status = 200, description = "People whose safety net you're part of", body = Vec<TrustedByResponse>))
)]
pub async fn list_as_contact(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let rows = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::ContactUserId.eq(session.user.id))
        .filter(trusted_contact::Column::Status.eq(TrustedContactStatusEnum::Accepted))
        .all(&state.db)
        .await
        .expect("failed to query trusted-by relationships");

    let owner_ids: Vec<String> = rows.iter().map(|r| r.owner_user_id.clone()).collect();
    let profiles = profiles_for(&state.db, owner_ids, &state.config).await;

    Json(
        rows.into_iter()
            .map(|row| TrustedByResponse {
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
        .filter(trusted_contact::Column::OwnerUserId.eq(session.user.id))
        .one(&state.db)
        .await
        .expect("failed to query trusted contact")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mut active = model.into_active_model();
    active.status = Set(TrustedContactStatusEnum::Revoked);
    active.updated_at = Set(Utc::now().into());
    active
        .update(&state.db)
        .await
        .expect("failed to revoke trusted contact");

    StatusCode::OK.into_response()
}
