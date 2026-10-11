pub mod guard;
pub mod handlers;
pub mod service;

use crate::state::AppState;
use axum::routing::post;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/", post(handlers::handle_webhook))
}
