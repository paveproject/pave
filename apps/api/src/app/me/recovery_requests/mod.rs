pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::{delete, get, post};
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(handlers::create_recovery_request))
        .route("/current", get(handlers::get_current_recovery_request))
        .route("/{id}", delete(handlers::cancel_recovery_request))
        .route("/{id}/shares", get(handlers::list_recovery_request_shares))
        .route("/{id}/complete", post(handlers::complete_recovery_request))
        .route("/{id}/approve", post(handlers::approve_recovery_request))
        .route("/{id}/decline", post(handlers::decline_recovery_request))
}

/// Merged into `me::openapi` - no `main.rs` change needed to add a
/// path/schema here.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::create_recovery_request,
        handlers::get_current_recovery_request,
        handlers::list_recovery_request_shares,
        handlers::cancel_recovery_request,
        handlers::complete_recovery_request,
        handlers::approve_recovery_request,
        handlers::decline_recovery_request
    ),
    components(schemas(
        dto::MeRecoveryRequestsStatus,
        dto::MeRecoveryRequestsContactStatus,
        dto::MeRecoveryRequestsResponse,
        dto::MeRecoveryRequestsContactResponse,
        dto::MeRecoveryRequestsApproveRequest,
        dto::MeRecoveryRequestsShareItem
    ))
)]
pub struct ApiDoc;
