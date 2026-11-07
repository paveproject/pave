pub mod data_access;
pub mod devices;
pub mod protest_sessions;
pub mod recovery_request;
pub mod recovery_requests;
pub mod trusted_contact;
pub mod trusted_contacts;

use crate::state::AppState;
use axum::Router;
use utoipa::OpenApi as _;

/// Everything addressed by a user id. Each leaf module owns exactly its own
/// route, and the folder tree mirrors the URL tree.
///
/// The DTOs and the query helpers live in the domain module that also serves
/// the item routes (`app::devices`, `app::trusted_contacts`, ...) and are
/// imported from here, so a response shape has one owner.
pub fn router() -> Router<AppState> {
    Router::new()
        .merge(data_access::router())
        .merge(devices::router())
        .merge(protest_sessions::router())
        .merge(trusted_contacts::router())
        .merge(trusted_contact::router())
        .merge(recovery_requests::router())
        .merge(recovery_request::router())
}

pub fn openapi() -> utoipa::openapi::OpenApi {
    data_access::openapi()
        .merge_from(devices::ApiDoc::openapi())
        .merge_from(protest_sessions::ApiDoc::openapi())
        .merge_from(trusted_contacts::ApiDoc::openapi())
        .merge_from(trusted_contact::openapi())
        .merge_from(recovery_requests::ApiDoc::openapi())
        .merge_from(recovery_request::openapi())
}
