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
