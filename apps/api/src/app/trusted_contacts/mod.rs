pub mod dto;
pub mod handlers;
pub mod invite;

use crate::state::AppState;
use axum::Router;
use utoipa::OpenApi as _;

/// One trusted-contact relationship, by its id, plus the invite redemption
/// (keyed by the code in the body - the caller is joining someone else's net).
/// The account-scoped views live under `app::users::trusted_contact*`; the
/// DTOs and the `profiles_for`/`device_summaries_for` helpers stay here.
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/trusted-contact/{trusted_contact_id}",
            axum::routing::delete(handlers::revoke_trusted_contact),
        )
        .merge(invite::router())
}

#[derive(utoipa::OpenApi)]
#[openapi(
    paths(handlers::revoke_trusted_contact),
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
struct OwnApiDoc;

pub fn openapi() -> utoipa::openapi::OpenApi {
    OwnApiDoc::openapi().merge_from(invite::ApiDoc::openapi())
}
