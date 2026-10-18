pub mod avatar;
pub mod devices;
pub mod dto;
pub mod events;
pub mod handlers;
pub mod pending_actions;
pub mod protest_sessions;
pub mod push_token;
pub mod recovery_requests;
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
        .nest("/pending-actions", pending_actions::router())
        .nest("/protest-sessions", protest_sessions::router())
        .nest("/push-token", push_token::router())
        .nest("/trusted-contacts", trusted_contacts::router())
        .nest("/recovery-requests", recovery_requests::router())
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
        dto::MeDeviceSummary,
        // Not a response body anywhere - registered purely so the
        // generated TS SDK carries the exact push `data` shape the
        // mobile `NotificationsProvider` switches on (see `PushContent`'s
        // own doc comment).
        notify_contracts::PushContent
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
        .merge_from(pending_actions::ApiDoc::openapi())
        .merge_from(protest_sessions::ApiDoc::openapi())
        .merge_from(push_token::ApiDoc::openapi())
        .merge_from(trusted_contacts::ApiDoc::openapi())
        .merge_from(recovery_requests::ApiDoc::openapi())
        .merge_from(events::ApiDoc::openapi())
}
