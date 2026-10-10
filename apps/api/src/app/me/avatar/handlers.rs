use crate::app::me::dto::MeResponse;
use crate::app::me::handlers::{ensure_pave_user_row, to_me_response};
use auth::schema::user as auth_user;
use auth::AppAuthSchema;
use axum::extract::{Multipart, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use sea_orm::{ActiveValue::Set, EntityTrait};
use uuid::Uuid;

use crate::state::AppState;

const ALLOWED_CONTENT_TYPES: &[&str] = &["image/jpeg", "image/png", "image/webp"];

fn extension_for(content_type: &str) -> &'static str {
    match content_type {
        "image/png" => "png",
        "image/webp" => "webp",
        _ => "jpg",
    }
}

#[utoipa::path(
    post,
    path = "/me/avatar",
    tag = "Me",
    responses((status = 200, description = "Avatar updated", body = MeResponse))
)]
pub async fn set_avatar(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();

    let Ok(Some(field)) = multipart.next_field().await else {
        return (StatusCode::BAD_REQUEST, "no file uploaded").into_response();
    };

    let content_type = field
        .content_type()
        .unwrap_or("application/octet-stream")
        .to_string();
    if !ALLOWED_CONTENT_TYPES.contains(&content_type.as_str()) {
        return (
            StatusCode::BAD_REQUEST,
            format!(
                "invalid file type, allowed: {}",
                ALLOWED_CONTENT_TYPES.join(", ")
            ),
        )
            .into_response();
    }

    let bytes = field.bytes().await.expect("failed to read uploaded file");
    let key = format!(
        "avatars/{}.{}",
        Uuid::new_v4(),
        extension_for(&content_type)
    );

    state
        .s3
        .put_object()
        .bucket(&state.s3_bucket)
        .key(&key)
        .body(aws_sdk_s3::primitives::ByteStream::from(bytes.to_vec()))
        .content_type(content_type)
        .send()
        .await
        .expect("failed to upload avatar");

    let image_url = format!("{}/{}/{}", state.s3_public_endpoint, state.s3_bucket, key);

    auth_user::Entity::update(auth_user::ActiveModel {
        id: Set(user_id.clone()),
        image: Set(Some(image_url)),
        ..Default::default()
    })
    .exec(&state.db)
    .await
    .expect("failed to update user avatar");

    let auth_user_row = auth_user::Entity::find_by_id(user_id.clone())
        .one(&state.db)
        .await
        .expect("failed to query user")
        .expect("user not found");
    let pave_user_row = ensure_pave_user_row(&state.db, &user_id).await;

    Json(to_me_response(auth_user_row, pave_user_row)).into_response()
}

#[utoipa::path(
    delete,
    path = "/me/avatar",
    tag = "Me",
    responses((status = 200, description = "Avatar removed", body = MeResponse))
)]
pub async fn delete_avatar(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();
    let object_prefix = format!("{}/{}/", state.s3_public_endpoint, state.s3_bucket);

    if let Some(key) = session
        .user
        .image
        .as_deref()
        .and_then(|url| url.strip_prefix(&object_prefix))
    {
        let _ = state
            .s3
            .delete_object()
            .bucket(&state.s3_bucket)
            .key(key)
            .send()
            .await;
    }

    auth_user::Entity::update(auth_user::ActiveModel {
        id: Set(user_id.clone()),
        image: Set(None),
        ..Default::default()
    })
    .exec(&state.db)
    .await
    .expect("failed to clear user avatar");

    let auth_user_row = auth_user::Entity::find_by_id(user_id.clone())
        .one(&state.db)
        .await
        .expect("failed to query user")
        .expect("user not found");
    let pave_user_row = ensure_pave_user_row(&state.db, &user_id).await;

    Json(to_me_response(auth_user_row, pave_user_row))
}
