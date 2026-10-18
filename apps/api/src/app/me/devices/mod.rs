pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::{delete, get, post, put};
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::list_devices).put(handlers::set_device))
        .route("/{id}", delete(handlers::revoke_device))
        .route("/{id}/dek", put(handlers::set_device_dek))
        .route("/{id}/approve", post(handlers::approve_device))
        .route("/{id}/decline", post(handlers::decline_device))
}

/// Merged into `me::openapi` - no `main.rs` change needed to add a
/// path/schema here.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::set_device,
        handlers::list_devices,
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
