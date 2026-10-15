pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::{delete, get, put};
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::list_devices).put(handlers::set_device))
        .route("/{id}", delete(handlers::revoke_device))
        .route("/{id}/dek", put(handlers::set_device_dek))
}

/// This module's own slice of the OpenAPI doc - merged into `me`'s own
/// (see `me::openapi`), so adding a path/schema here never requires
/// touching `main.rs`.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::set_device,
        handlers::list_devices,
        handlers::revoke_device,
        handlers::set_device_dek
    ),
    components(schemas(
        dto::MeDevicesSetRequest,
        dto::MeDevicesResponse,
        dto::MeDevicesSetDekRequest
    ))
)]
pub struct ApiDoc;
