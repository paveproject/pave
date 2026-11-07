pub mod request;
pub mod requests;

use crate::state::AppState;
use axum::Router;
use utoipa::OpenApi as _;

/// The data-access routes addressed by *whose* data it is.
pub fn router() -> Router<AppState> {
    requests::router().merge(request::router())
}

pub fn openapi() -> utoipa::openapi::OpenApi {
    requests::ApiDoc::openapi().merge_from(request::openapi())
}
