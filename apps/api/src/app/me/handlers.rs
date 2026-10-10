use super::dto::{MeResponse, UpdateMeRequest, UsernameAvailableQuery, UsernameAvailableResponse};
use crate::entities::user as pave_user;
use crate::state::AppState;
use auth::schema::user as auth_user;
use auth::AppAuthSchema;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::{CurrentSession, OptionalSession};
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, EntityTrait,
    IntoActiveModel, QueryFilter, TryIntoModel,
};

/// Pave's own `user` row isn't created by better-auth-rs (it only owns the
/// `auth` schema's 4 tables) - there's no signup hook yet to create it, so
/// any handler reading or writing it has to be able to create it on first
/// access instead of assuming it already exists.
pub(crate) async fn ensure_pave_user_row(
    db: &DatabaseConnection,
    user_id: &str,
) -> pave_user::Model {
    if let Some(existing) = pave_user::Entity::find_by_id(user_id.to_string())
        .one(db)
        .await
        .expect("failed to query user")
    {
        return existing;
    }

    pave_user::ActiveModel {
        id: Set(user_id.to_string()),
        // Matches `defaultSupportedLocale` in libs/i18n - not the stale
        // 'en-US' the Drizzle column default was left at (pre-existing
        // mismatch: the FK to i18n.supported_languages only has 'en'/'fr').
        language: Set("en".to_string()),
        welcomed_at: Set(None),
        username_updated_at: Set(None),
    }
    .insert(db)
    .await
    .expect("failed to create user row")
}

pub(crate) fn to_me_response(
    auth_user: auth_user::Model,
    pave_user: pave_user::Model,
) -> MeResponse {
    MeResponse {
        id: auth_user.id,
        email: auth_user.email,
        email_verified: auth_user.email_verified,
        name: auth_user.name,
        username: auth_user.username,
        image: auth_user.image,
        language: pave_user.language,
        welcomed_at: pave_user.welcomed_at.map(|d| d.to_rfc3339()),
        username_updated_at: pave_user.username_updated_at.map(|d| d.to_rfc3339()),
    }
}

async fn find_auth_user(db: &DatabaseConnection, user_id: &str) -> auth_user::Model {
    auth_user::Entity::find_by_id(user_id.to_string())
        .one(db)
        .await
        .expect("failed to query auth user")
        .expect("auth user not found")
}

#[utoipa::path(
    get,
    path = "/me",
    tag = "Me",
    responses((status = 200, description = "Current user, null if not authenticated", body = Option<MeResponse>))
)]
pub async fn get_me(
    State(state): State<AppState>,
    session: OptionalSession<AppAuthSchema>,
) -> impl IntoResponse {
    let Some(session) = session.0 else {
        return Json(None::<MeResponse>);
    };

    let pave_user_row = ensure_pave_user_row(&state.db, &session.user.id).await;
    Json(Some(to_me_response(session.user, pave_user_row)))
}

#[utoipa::path(
    patch,
    path = "/me",
    tag = "Me",
    request_body = UpdateMeRequest,
    responses((status = 200, description = "Updated current user", body = MeResponse))
)]
pub async fn update_me(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<UpdateMeRequest>,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();

    // Name/username are owned by better-auth-rs's own `auth.users` table.
    let mut auth_active = auth_user::ActiveModel {
        id: Set(user_id.clone()),
        ..Default::default()
    };
    let mut auth_changed = false;
    if let Some(name) = body.name {
        auth_active.name = Set(Some(name));
        auth_changed = true;
    }
    if let Some(username) = body.username.clone() {
        auth_active.username = Set(Some(username));
        auth_changed = true;
    }
    if auth_changed {
        auth_user::Entity::update(auth_active)
            .exec(&state.db)
            .await
            .expect("failed to update auth user");
    }

    // Language/welcome flow/username cooldown are Pave's own fields.
    let pave_user_row = ensure_pave_user_row(&state.db, &user_id).await;
    let mut pave_active = pave_user_row.into_active_model();
    let mut pave_changed = false;
    if let Some(language) = body.language {
        pave_active.language = Set(language);
        pave_changed = true;
    }
    if body.welcomed == Some(true) {
        pave_active.welcomed_at = Set(Some(Utc::now().into()));
        pave_changed = true;
    }
    if body.username.is_some() {
        pave_active.username_updated_at = Set(Some(Utc::now().into()));
        pave_changed = true;
    }
    let pave_user_row = if pave_changed {
        pave_active
            .update(&state.db)
            .await
            .expect("failed to update user")
    } else {
        pave_active
            .try_into_model()
            .expect("active model missing fields")
    };

    let auth_user_row = find_auth_user(&state.db, &user_id).await;
    Json(to_me_response(auth_user_row, pave_user_row))
}

#[utoipa::path(
    get,
    path = "/me/username-available",
    tag = "Me",
    params(UsernameAvailableQuery),
    responses((status = 200, description = "Whether the username is free", body = UsernameAvailableResponse))
)]
pub async fn check_username_available(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Query(query): Query<UsernameAvailableQuery>,
) -> impl IntoResponse {
    let taken = auth_user::Entity::find()
        .filter(auth_user::Column::Username.eq(query.username))
        .filter(auth_user::Column::Id.ne(session.user.id))
        .one(&state.db)
        .await
        .expect("failed to query username availability")
        .is_some();
    Json(UsernameAvailableResponse { available: !taken })
}
