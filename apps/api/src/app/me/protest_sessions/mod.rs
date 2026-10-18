pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::{patch, post, put};
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/{id}", put(handlers::create_or_get_session))
        .route("/{id}", patch(handlers::end_session))
        .route("/{id}/uploads", post(handlers::upload))
}

/// Merged into `me::openapi` - no `main.rs` change needed to add a
/// path/schema here.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::create_or_get_session,
        handlers::end_session,
        handlers::upload
    ),
    components(schemas(
        dto::MeProtestUploadKind,
        dto::MeProtestSessionCreateRequest,
        dto::MeProtestSessionEndRequest,
        dto::MeProtestSessionResponse,
        dto::MeProtestUploadResponse
    ))
)]
pub struct ApiDoc;
