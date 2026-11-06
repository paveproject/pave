pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::{delete, get, post};
use axum::Router;

/// One recovery request, by its id. Creating one and reading the account's
/// current one live under `app::users::recovery_request*`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/recovery-request/{recovery_request_id}",
            delete(handlers::cancel_recovery_request),
        )
        .route(
            "/recovery-request/{recovery_request_id}/shares",
            get(handlers::list_recovery_request_shares),
        )
        .route(
            "/recovery-request/{recovery_request_id}/complete",
            post(handlers::complete_recovery_request),
        )
        .route(
            "/recovery-request/{recovery_request_id}/approve",
            post(handlers::approve_recovery_request),
        )
        .route(
            "/recovery-request/{recovery_request_id}/decline",
            post(handlers::decline_recovery_request),
        )
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
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
