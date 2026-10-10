pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(handlers::list_reports).post(handlers::create_report))
}
