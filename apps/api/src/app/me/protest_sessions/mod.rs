pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::{get, put};
use axum::Router;

/// Protest-mode recording sessions and their encrypted payloads.
///
/// Everything here is opaque to the server: it stores sealed keys and
/// ciphertext and can open neither. Reads are for the owner, or a
/// trusted-contact quorum holding the recovered DEK.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::list_sessions))
        .route(
            "/{id}",
            put(handlers::upsert_session)
                .patch(handlers::end_session)
                .delete(handlers::delete_session),
        )
        .route(
            "/{id}/blobs/{blob_id}",
            put(handlers::upload_blob).get(handlers::download_blob),
        )
}

/// Merged into `me::openapi`.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::list_sessions,
        handlers::upsert_session,
        handlers::end_session,
        handlers::delete_session,
        handlers::upload_blob,
        handlers::download_blob,
    ),
    components(schemas(
        dto::ProtestSessionUpsertRequest,
        dto::ProtestSessionEndRequest,
        dto::ProtestSessionResponse,
        dto::ProtestBlobResponse,
    ))
)]
pub struct ApiDoc;
