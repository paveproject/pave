pub mod handlers;

use crate::state::AppState;
use axum::routing::post;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/",
        post(handlers::set_avatar).delete(handlers::delete_avatar),
    )
}

/// Merged into `me::openapi`. No `components(schemas(...))` - neither
/// handler has a JSON request/response body of its own.
#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::set_avatar, handlers::delete_avatar))]
pub struct ApiDoc;
