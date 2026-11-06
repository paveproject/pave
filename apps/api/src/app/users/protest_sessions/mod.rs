pub mod handlers;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user/{user_id}/protest-sessions",
        get(handlers::list_sessions),
    )
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::list_sessions))]
pub struct ApiDoc;
