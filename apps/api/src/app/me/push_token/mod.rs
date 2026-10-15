pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::put;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/", put(handlers::set_push_token))
}

/// This module's own slice of the OpenAPI doc - merged into `me`'s own
/// (see `me::openapi`), so adding a path/schema here never requires
/// touching `main.rs`.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(handlers::set_push_token),
    components(schemas(dto::MePushTokenSetRequest, dto::PushProvider, dto::DeviceType))
)]
pub struct ApiDoc;
