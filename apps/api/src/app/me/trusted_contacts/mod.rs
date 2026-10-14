pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::{get, post, put};
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/invite", get(handlers::generate_invite))
        .route("/redeem", post(handlers::redeem_invite))
        .route("/", get(handlers::list_trusted_contacts))
        .route("/as-contact", get(handlers::list_as_contact))
        .route("/shares", put(handlers::set_shares))
        .route(
            "/{id}",
            axum::routing::delete(handlers::revoke_trusted_contact),
        )
}
