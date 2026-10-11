pub mod dto;
pub mod guard;
pub mod handlers;

use crate::state::AppState;
use axum::routing::post;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/", post(handlers::report_version))
}
