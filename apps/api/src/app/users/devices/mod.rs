pub mod handlers;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/user/{user_id}/devices",
        get(handlers::list_devices).put(handlers::set_device),
    )
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::list_devices, handlers::set_device))]
pub struct ApiDoc;
