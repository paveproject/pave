pub mod handlers;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user/{user_id}/trusted-contacts",
        get(handlers::list_trusted_contacts),
    )
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::list_trusted_contacts))]
pub struct ApiDoc;
