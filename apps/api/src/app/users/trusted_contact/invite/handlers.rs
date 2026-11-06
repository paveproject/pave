use crate::app::access::authorize_user_scope;
use crate::app::trusted_contacts::dto::MeTrustedContactsGenerateInviteResponse;
use crate::app::trusted_contacts::handlers::{generate_code, hash_code, INVITE_CODE_TTL_HOURS};
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::{Duration, Utc};
use db_rs::sea_orm_active_enums::TrustedContactStatusEnum;
use db_rs::trusted_contact;
use sea_orm::sea_query::{Expr, OnConflict};
use sea_orm::{ActiveValue::Set, EntityTrait};
use uuid::Uuid;

/// `GET`, not `POST`: deliberately not idempotent - every call rotates the
/// code, so the mobile client treats "my current invite" as a plain query
/// it can refetch/invalidate instead of juggling mutation state by hand.
#[utoipa::path(
    get,
    path = "/user/{user_id}/trusted-contact/invite",
    tag = "TrustedContacts",
    params(("user_id" = String, Path, description = "Account the invite is for")),
    responses(
        (status = 200, description = "Current invite code - calling this again rotates it, shown once, share it out-of-band", body = MeTrustedContactsGenerateInviteResponse),
        (status = 404, description = "Not your account")
    )
)]
pub async fn generate_invite(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
) -> impl IntoResponse {
    if let Err(status) = authorize_user_scope(&session, &user_id) {
        return status.into_response();
    }
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
