use super::dto::MePushTokenSetRequest;
use crate::libs::entities::push_token;
use crate::libs::entities::sea_orm_active_enums::{DeviceTypeEnum, PushProviderEnum};
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::Utc;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
};

/// Registers a push token for the current session, or refreshes it (new
/// session, new device type) if it was already registered - the
/// `(user_id, token, provider)` unique constraint is what distinguishes the
/// two cases (see libs/db's Drizzle `push_token` schema for the TS equivalent).
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

    let existing = push_token::Entity::find()
        .filter(push_token::Column::UserId.eq(session.user.id.clone()))
        .filter(push_token::Column::Token.eq(body.token.clone()))
        .filter(push_token::Column::Provider.eq(provider.clone()))
        .one(&state.db)
        .await
        .expect("failed to query push token");

    match existing {
        Some(model) => {
            let mut active = model.into_active_model();
            active.session_id = Set(session.session.id.clone());
            active.device_type = Set(device_type);
            active.updated_at = Set(Utc::now().into());
            active
                .update(&state.db)
                .await
                .expect("failed to update push token");
        }
        None => {
            push_token::ActiveModel {
                id: Set(uuid::Uuid::new_v4()),
                user_id: Set(session.user.id.clone()),
                session_id: Set(session.session.id.clone()),
                provider: Set(provider),
                token: Set(body.token),
                device_type: Set(device_type),
                created_at: Set(Utc::now().into()),
                updated_at: Set(Utc::now().into()),
            }
            .insert(&state.db)
            .await
            .expect("failed to create push token");
        }
    }

    StatusCode::OK
}
