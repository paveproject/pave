pub mod handlers;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user/{user_id}/recovery-request/current",
        get(handlers::get_current_recovery_request),
    )
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::get_current_recovery_request))]
pub struct ApiDoc;
