pub mod handlers;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user/{user_id}/trusted-contact/invite",
        get(handlers::generate_invite),
    )
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::generate_invite))]
pub struct ApiDoc;
