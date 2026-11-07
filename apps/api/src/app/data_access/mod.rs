pub mod requests;

use crate::state::AppState;
use axum::Router;
use utoipa::OpenApi as _;

/// Opening a user's ciphertext to someone else, visibly and under a quorum.
/// `requests` is the only sub-resource so far; the folder exists so the next
/// one is a sibling rather than a reason to move these files.
pub fn router() -> Router<AppState> {
    requests::router()
}

pub fn openapi() -> utoipa::openapi::OpenApi {
    requests::ApiDoc::openapi()
}
