pub mod handlers;
pub mod hub;
pub mod ws_dto;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/ws", get(handlers::user_events_ws))
}
