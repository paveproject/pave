pub mod handlers;

use crate::state::AppState;
use axum::routing::post;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user/{user_id}/data-access/requests",
        post(handlers::create_data_access_request),
    )
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::create_data_access_request))]
pub struct ApiDoc;
