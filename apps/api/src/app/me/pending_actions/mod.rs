pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(handlers::get_pending_actions))
}

/// Merged into `me::openapi` - no `main.rs` change needed to add a
/// path/schema here.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(handlers::get_pending_actions),
    components(schemas(dto::MePendingAction))
)]
pub struct ApiDoc;
