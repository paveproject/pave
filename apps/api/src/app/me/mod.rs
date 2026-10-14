pub mod avatar;
pub mod devices;
pub mod dto;
pub mod events;
pub mod handlers;
pub mod push_token;
pub mod trusted_contacts;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

/// Everything about the current logged-in user: GET/PATCH /me, plus the
/// avatar, devices, push-token, trusted-contacts and personal-events
/// sub-resources nested under it.
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::get_me).patch(handlers::update_me))
        .route(
            "/username-available",
            get(handlers::check_username_available),
        )
        .nest("/avatar", avatar::router())
        .nest("/devices", devices::router())
        .nest("/push-token", push_token::router())
        .nest("/trusted-contacts", trusted_contacts::router())
        .merge(events::router())
}
