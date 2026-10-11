pub mod avatar;
pub mod dto;
pub mod handlers;
pub mod push_token;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

/// Everything about the current logged-in user: GET/PATCH /me, plus the
/// avatar and push-token sub-resources nested under it.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::get_me).patch(handlers::update_me))
        .route(
            "/username-available",
            get(handlers::check_username_available),
        )
        .nest("/avatar", avatar::router())
        .nest("/push-token", push_token::router())
}
