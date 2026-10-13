use super::guard::verify_signature;
use super::service::handle_event;
use crate::state::AppState;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use serde_json::Value;

/// Not registered in `ApiDoc` - same `@ApiExcludeEndpoint()` convention as
/// Recomend's `WebhookAppStoreConnectController`, this is only ever called
/// by Apple.
///
/// `Bytes` (not `Json<...>`) on purpose: the signature in
/// [`verify_signature`] is computed over the exact raw bytes Apple sent,
/// before any JSON parsing - axum's `Json` extractor would consume and
/// re-serialize the body, which isn't guaranteed to round-trip byte-for-byte.
pub async fn handle_webhook(
    State(state): State<AppState>,
    headers: HeaderMap,
    body: Bytes,
) -> StatusCode {
    let Some(secret) = state.config.app_store_connect_webhook_secret.as_deref() else {
        tracing::warn!("APP_STORE_CONNECT_WEBHOOK_SECRET not set, rejecting webhook delivery");
        return StatusCode::UNAUTHORIZED;
    };

    if !verify_signature(&headers, &body, secret) {
        return StatusCode::UNAUTHORIZED;
    }

    let Ok(payload) = serde_json::from_slice::<Value>(&body) else {
        // Verified-but-malformed can't happen from the real Apple, but ack
        // rather than make Apple retry-loop a delivery we can never parse.
        tracing::error!("failed to parse app-store-connect webhook payload");
        return StatusCode::OK;
    };

    let event = payload.get("data").cloned().unwrap_or(Value::Null);
    handle_event(&state.db, &state.app_store_connect, &event).await;

    StatusCode::OK
}
