pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::extract::DefaultBodyLimit;
use axum::routing::put;
use axum::Router;

/// Raised for this route alone, because `axum`'s default is 2 MB and a video
/// segment is the first payload here to go past it - audio runs about 360 KB a
/// minute and position batches are tiny, so the limit only showed up once
/// filming landed.
///
/// Sized off the recorder, not off the clip: `SEGMENT_SECONDS` (120) at the
/// Android bitrate (2 Mbps) caps a segment near 30 MB, whatever the length of
/// the recording it came from. `upload_blob` reads the whole body into memory
/// before putting it in the bucket, so this is also the per-upload memory
/// cost - which is the other reason not to make it generous.
const MAX_BLOB_BYTES: usize = 64 * 1024 * 1024;

/// One protest-mode session, by its id, and its encrypted payloads.
///
/// Everything here is opaque to the server: it stores sealed keys and
/// ciphertext and can open neither. The account-scoped list lives in
/// `app::users::protest_sessions`.
///
/// **There is deliberately no delete route.** A seized unlocked phone still
/// holds an authenticated session, and while it cannot read the recordings -
/// the session key is in SecureStore under the account DEK - a delete
/// endpoint would let whoever holds the device destroy them, server copies
/// included. That is the exact failure this feature exists to prevent, so
/// recordings are append-only and only leave with the account itself
/// (`owner_user_id`'s `ON DELETE CASCADE`). If manual deletion is ever
/// wanted, it needs a guard a seized device cannot satisfy - the recovery
/// phrase, or a cancellable delay like `recovery_request.release_at`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/protest-session/{protest_session_id}",
            put(handlers::upsert_session)
                .patch(handlers::end_session)
                .get(handlers::get_session),
        )
        .route(
            "/protest-session/{protest_session_id}/blob/{blob_id}",
            put(handlers::upload_blob)
                .get(handlers::download_blob)
                .layer(DefaultBodyLimit::max(MAX_BLOB_BYTES)),
        )
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::get_session,
        handlers::upsert_session,
        handlers::end_session,
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
