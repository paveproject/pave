pub mod handlers;

use crate::state::AppState;
use axum::routing::post;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/",
        post(handlers::set_avatar).delete(handlers::delete_avatar),
    )
}
