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

/// This module's own slice of the OpenAPI doc - merged into `me`'s own
/// (see `me::openapi`), so adding a path/schema here never requires
/// touching `main.rs`.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::generate_invite,
        handlers::redeem_invite,
        handlers::list_trusted_contacts,
        handlers::list_as_contact,
        handlers::set_shares,
        handlers::revoke_trusted_contact
    ),
    components(schemas(
        dto::TrustedContactStatus,
        dto::MeTrustedContactsGenerateInviteResponse,
        dto::MeTrustedContactsRedeemInviteRequest,
        dto::MeTrustedContactsResponse,
        dto::MeTrustedContactsAsContactResponse,
        dto::MeTrustedContactsShareUpdate,
        dto::MeTrustedContactsSetSharesRequest
    ))
)]
pub struct ApiDoc;
