pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::{get, post};
use axum::Router;

/// Threat model in `libs/db/src/lib/schemas/dataAccessRequest.ts`.
///
/// Everything here is addressed by a request id; the account-scoped halves
/// live under `app::users::data_access` and `app::me::data_access`.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/data-access/request/{data_access_request_id}",
            get(handlers::get_data_access_request),
        )
        .route(
            "/data-access/request/{data_access_request_id}/approve",
            post(handlers::approve_data_access_request),
        )
        .route(
            "/data-access/request/{data_access_request_id}/decline",
            post(handlers::decline_data_access_request),
        )
        .route(
            "/data-access/request/{data_access_request_id}/cancel",
            post(handlers::cancel_data_access_request),
        )
        .route(
            "/data-access/request/{data_access_request_id}/refuse",
            post(handlers::refuse_data_access_request),
        )
        .route(
            "/data-access/request/{data_access_request_id}/shares",
            get(handlers::list_data_access_request_shares),
        )
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::get_data_access_request,
        handlers::approve_data_access_request,
        handlers::decline_data_access_request,
        handlers::cancel_data_access_request,
        handlers::refuse_data_access_request,
        handlers::list_data_access_request_shares
    ),
    components(schemas(
        dto::DataAccessRequestStatus,
        dto::DataAccessState,
        dto::DataAccessRequestContactStatus,
        dto::DataAccessRequestResponse,
        dto::DataAccessRequestContactResponse,
        dto::DataAccessRequestApproveRequest,
        dto::DataAccessRequestShareItem
    ))
)]
pub struct ApiDoc;
