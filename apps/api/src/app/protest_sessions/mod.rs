pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::put;
use axum::Router;

/// One protest-mode session, by its id, and its encrypted payloads.
///
/// Everything here is opaque to the server: it stores sealed keys and
/// ciphertext and can open neither. The account-scoped list lives in
/// `app::users::protest_sessions`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/protest-session/{protest_session_id}",
            put(handlers::upsert_session)
                .patch(handlers::end_session)
                .delete(handlers::delete_session),
        )
        .route(
            "/protest-session/{protest_session_id}/blob/{blob_id}",
            put(handlers::upload_blob).get(handlers::download_blob),
        )
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
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
