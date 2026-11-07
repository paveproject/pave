pub mod current;

use crate::state::AppState;
use axum::Router;
use utoipa::OpenApi as _;

pub fn router() -> Router<AppState> {
    current::router()
}

pub fn openapi() -> utoipa::openapi::OpenApi {
    current::ApiDoc::openapi()
}
