pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::{delete, post, put};
use axum::Router;

/// One device, by its id. The account-scoped list and registration live in
/// `app::users::devices`; the DTOs and query helpers stay here.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/device/{device_id}", delete(handlers::revoke_device))
        .route("/device/{device_id}/dek", put(handlers::set_device_dek))
        .route(
            "/device/{device_id}/approve",
            post(handlers::approve_device),
        )
        .route(
            "/device/{device_id}/decline",
            post(handlers::decline_device),
        )
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::revoke_device,
        handlers::set_device_dek,
        handlers::approve_device,
        handlers::decline_device
    ),
    components(schemas(
        dto::MeDevicesSetRequest,
        dto::MeDevicesResponse,
        dto::MeDevicesStatus,
        dto::MeDevicesSetDekRequest,
        dto::MeDevicesDeclinedResponse,
        dto::MeOwnDeviceRegistrationResponse
    ))
)]
pub struct ApiDoc;
