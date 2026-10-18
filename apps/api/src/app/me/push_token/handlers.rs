use super::dto::MePushTokenSetRequest;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::Utc;
use db_rs::push_token;
use db_rs::sea_orm_active_enums::{DeviceTypeEnum, PushProviderEnum};
use sea_orm::sea_query::OnConflict;
use sea_orm::{ActiveValue::Set, EntityTrait};

/// Registers a push token for the current session, or refreshes it (new
/// session, new device type) if `(user_id, token, provider)` already exists.
#[utoipa::path(
    put,
    path = "/me/push-token",
    tag = "Me",
    request_body = MePushTokenSetRequest,
    responses((status = 200, description = "Push token registered"))
)]
pub async fn set_push_token(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<MePushTokenSetRequest>,
) -> impl IntoResponse {
    let provider: PushProviderEnum = body.provider.into();
    let device_type: DeviceTypeEnum = body.device_type.into();

    // One round trip, no race window - same fix as
    // `trusted_contacts::handlers::generate_invite`.
    push_token::Entity::insert(push_token::ActiveModel {
        id: Set(uuid::Uuid::new_v4()),
        user_id: Set(session.user.id.clone()),
        session_id: Set(session.session.id.clone()),
        provider: Set(provider),
        token: Set(body.token),
        device_type: Set(device_type),
        created_at: Set(Utc::now().into()),
        updated_at: Set(Utc::now().into()),
    })
    .on_conflict(
        OnConflict::columns([
            push_token::Column::UserId,
            push_token::Column::Token,
            push_token::Column::Provider,
        ])
        .update_columns([
            push_token::Column::SessionId,
            push_token::Column::DeviceType,
            push_token::Column::UpdatedAt,
        ])
        .to_owned(),
    )
    .exec(&state.db)
    .await
    .expect("failed to upsert push token");

    StatusCode::OK
}
