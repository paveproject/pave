use super::dto::{
    MeResponse, MeUpdateRequest, MeUsernameAvailableQuery, MeUsernameAvailableResponse,
};
use crate::config::ApiConfig;
use crate::libs::media;
use crate::state::AppState;
use auth::schema::user as auth_user;
use auth::AppAuthSchema;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::{CurrentSession, OptionalSession};
use chrono::Utc;
use db_rs::user as pave_user;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseConnection, EntityTrait,
    IntoActiveModel, QueryFilter, TryIntoModel,
};

/// Pave's own `user` row - created atomically alongside the `auth.users`
/// one by `libs::auth_hooks::CreatePaveUserRowHook`, so every real user
/// already has it by the time anything here runs.
pub(crate) async fn find_pave_user_row(db: &DatabaseConnection, user_id: &str) -> pave_user::Model {
    pave_user::Entity::find_by_id(user_id.to_string())
        .one(db)
        .await
        .expect("failed to query user")
        .expect("pave user row missing - CreatePaveUserRowHook should have created it at signup")
}

pub(crate) fn to_me_response(
    auth_user: auth_user::Model,
    pave_user: pave_user::Model,
    config: &ApiConfig,
) -> MeResponse {
    MeResponse {
        id: auth_user.id,
        email: auth_user.email,
        email_verified: auth_user.email_verified,
        name: auth_user.name,
        username: auth_user
            .display_username
            .expect("display_username is NOT NULL in db"),
        image: media::resolve_media_url(auth_user.image.as_deref(), media::AVATARS_FOLDER, config),
        language: pave_user.language,
        welcomed_at: pave_user.welcomed_at.map(|d| d.to_rfc3339()),
        username_updated_at: pave_user.username_updated_at.map(|d| d.to_rfc3339()),
    }
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

    let pave_user_row = find_pave_user_row(&state.db, &session.user.id).await;
    Json(Some(to_me_response(
        session.user,
        pave_user_row,
        &state.config,
    )))
}

#[utoipa::path(
    patch,
    path = "/me",
    tag = "Me",
    request_body = MeUpdateRequest,
    responses((status = 200, description = "Updated current user", body = MeResponse))
)]
pub async fn update_me(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<MeUpdateRequest>,
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
        auth_active.username = Set(Some(username.to_lowercase()));
        auth_active.display_username = Set(Some(username));
        auth_changed = true;
    }

    // Independent of each other (different tables) - resolved
    // concurrently. `update(...).exec()` already returns the full
    // updated model, and the session already has it when nothing
    // changed - no final refetch needed either way.
    let auth_update = async {
        if auth_changed {
            auth_user::Entity::update(auth_active)
                .exec(&state.db)
                .await
                .expect("failed to update auth user")
        } else {
            session.user
        }
    };
    let (auth_user_row, pave_user_row) =
        tokio::join!(auth_update, find_pave_user_row(&state.db, &user_id));

    // Language/welcome flow/username cooldown are Pave's own fields.
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

    Json(to_me_response(auth_user_row, pave_user_row, &state.config))
}

#[utoipa::path(
    get,
    path = "/me/username-available",
    tag = "Me",
    params(MeUsernameAvailableQuery),
    responses((status = 200, description = "Whether the username is free", body = MeUsernameAvailableResponse))
)]
pub async fn check_username_available(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Query(query): Query<MeUsernameAvailableQuery>,
) -> impl IntoResponse {
    let taken = auth_user::Entity::find()
        .filter(auth_user::Column::Username.eq(query.username.to_lowercase()))
        .filter(auth_user::Column::Id.ne(session.user.id))
        .one(&state.db)
        .await
        .expect("failed to query username availability")
        .is_some();
    Json(MeUsernameAvailableResponse { available: !taken })
}
