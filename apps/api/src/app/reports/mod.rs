pub mod dto;
pub mod geohash_util;
pub mod handlers;
pub mod hub;
pub mod rate_limit;
pub mod ws_dto;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(handlers::list_reports).post(handlers::create_report),
        )
        .route("/ws", get(handlers::reports_ws))
}
