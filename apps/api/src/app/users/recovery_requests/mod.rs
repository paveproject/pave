pub mod handlers;

use crate::state::AppState;
use axum::routing::post;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user/{user_id}/recovery-requests",
        post(handlers::create_recovery_request),
    )
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::create_recovery_request))]
pub struct ApiDoc;
