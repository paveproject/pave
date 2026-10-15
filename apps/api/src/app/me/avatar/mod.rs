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

/// This module's own slice of the OpenAPI doc - merged into `me`'s own
/// (see `me::openapi`), so adding a path here never requires touching
/// `main.rs`. No `components(schemas(...))` - neither handler has a JSON
/// request/response body of its own.
#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::set_avatar, handlers::delete_avatar))]
pub struct ApiDoc;
