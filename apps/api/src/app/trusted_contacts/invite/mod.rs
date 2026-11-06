pub mod handlers;

use crate::state::AppState;
use axum::routing::post;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/trusted-contact/invite/redeem",
        post(handlers::redeem_invite),
    )
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::redeem_invite))]
pub struct ApiDoc;
