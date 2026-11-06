pub mod handlers;

use crate::state::AppState;
use axum::routing::put;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user/{user_id}/trusted-contact/shares",
        put(handlers::set_shares),
    )
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::set_shares))]
pub struct ApiDoc;
