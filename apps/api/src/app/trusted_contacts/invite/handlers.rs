use crate::app::me::dto::MeProfile;
use crate::app::me::events::ws_dto::MeEventsUserEvent;
use crate::app::trusted_contacts::dto::{
    MeTrustedContactsAsContactResponse, MeTrustedContactsRedeemInviteRequest,
    MeTrustedContactsResponse, TrustedContactStatus,
};
use crate::app::trusted_contacts::handlers::{device_summaries_for, hash_code, profiles_for};
use crate::libs::media;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::Utc;
use db_rs::sea_orm_active_enums::TrustedContactStatusEnum;
use db_rs::trusted_contact;
use notify_contracts::{NotifyJob, PushContent, PushNotifyPayload, PushTarget};
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
};

#[utoipa::path(
    post,
    path = "/trusted-contact/invite/redeem",
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
