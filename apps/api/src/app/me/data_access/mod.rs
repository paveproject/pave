pub mod requests;

use crate::state::AppState;
use axum::Router;
use utoipa::OpenApi as _;

/// `/me` rather than `/user/{user_id}`: "the requests I made" has no sense
/// addressed by someone else's id.
pub fn router() -> Router<AppState> {
    Router::new().nest("/requests", requests::router())
}

pub fn openapi() -> utoipa::openapi::OpenApi {
    requests::ApiDoc::openapi()
}
