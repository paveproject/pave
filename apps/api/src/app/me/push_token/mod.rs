pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::put;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/", put(handlers::set_push_token))
}

/// Merged into `me::openapi` - no `main.rs` change needed to add a
/// path/schema here.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(handlers::set_push_token),
    components(schemas(dto::MePushTokenSetRequest, dto::PushProvider, dto::DeviceType))
)]
pub struct ApiDoc;
