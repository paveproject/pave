pub mod invite;
pub mod of;
pub mod shares;

use crate::state::AppState;
use axum::Router;
use utoipa::OpenApi as _;

pub fn router() -> Router<AppState> {
    Router::new()
        .merge(invite::router())
        .merge(of::router())
        .merge(shares::router())
}

pub fn openapi() -> utoipa::openapi::OpenApi {
    invite::ApiDoc::openapi()
        .merge_from(of::ApiDoc::openapi())
        .merge_from(shares::ApiDoc::openapi())
}
