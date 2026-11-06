pub mod handlers;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user/{user_id}/trusted-contact/of",
        get(handlers::list_as_contact),
    )
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::list_as_contact))]
pub struct ApiDoc;
