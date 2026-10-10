pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::put;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/", put(handlers::set_push_token))
}
