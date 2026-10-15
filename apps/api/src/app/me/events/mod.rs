pub mod handlers;
pub mod hub;
pub mod ws_dto;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/ws", get(handlers::user_events_ws))
}

/// This module's own slice of the OpenAPI doc - merged into `me`'s own
/// (see `me::openapi`), so adding a schema here never requires touching
/// `main.rs`. No `paths(...)` - `/me/ws` is a websocket upgrade, not
/// representable as an OpenAPI path; only the event payload shape it
/// carries is documented.
#[derive(utoipa::OpenApi)]
#[openapi(components(schemas(ws_dto::MeEventsUserEvent)))]
pub struct ApiDoc;
