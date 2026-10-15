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
use utoipa::OpenApi as _;

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

/// This module's own direct paths/schemas - everything at `/me` itself,
/// not already owned by one of its sub-resource modules below.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::get_me,
        handlers::update_me,
        handlers::check_username_available
    ),
    components(schemas(
        dto::MeResponse,
        dto::MeUpdateRequest,
        dto::MeUsernameAvailableResponse,
        dto::MeProfile,
        dto::MeDeviceSummary
    ))
)]
struct ApiDoc;

/// The full `/me` slice of the OpenAPI doc: this module's own paths/schemas
/// merged with every sub-resource's - `main.rs` only ever calls this one
/// function, never reaches into `avatar`/`devices`/etc. directly.
pub fn openapi() -> utoipa::openapi::OpenApi {
    ApiDoc::openapi()
        .merge_from(avatar::ApiDoc::openapi())
        .merge_from(devices::ApiDoc::openapi())
        .merge_from(push_token::ApiDoc::openapi())
        .merge_from(trusted_contacts::ApiDoc::openapi())
        .merge_from(events::ApiDoc::openapi())
}
