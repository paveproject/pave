pub mod avatar;
pub mod data_access;
pub mod dto;
pub mod events;
pub mod handlers;
pub mod pending_actions;
pub mod push_token;
pub mod recovery_dek_generation;
pub mod recovery_key_mnemonic;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;
use utoipa::OpenApi as _;

/// What is intrinsically the caller's own: the profile, its avatar, the push
/// token, the recovery-phrase blob and DEK generation counter, the aggregate
/// pending-actions feed, and the per-user websocket. Anything addressable by
/// an id lives under its own domain route instead (see `app::devices`,
/// `app::protest_sessions`, ...).
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(handlers::get_me).patch(handlers::update_me))
        .route(
            "/username-available",
            get(handlers::check_username_available),
        )
        .nest("/avatar", avatar::router())
        .nest("/data-access", data_access::router())
        .nest("/pending-actions", pending_actions::router())
        .nest("/push-token", push_token::router())
        .nest("/recovery-key-mnemonic", recovery_key_mnemonic::router())
        .nest(
            "/recovery-dek-generation",
            recovery_dek_generation::router(),
        )
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
        .merge_from(data_access::openapi())
        .merge_from(pending_actions::ApiDoc::openapi())
        .merge_from(push_token::ApiDoc::openapi())
        .merge_from(recovery_key_mnemonic::ApiDoc::openapi())
        .merge_from(recovery_dek_generation::ApiDoc::openapi())
        .merge_from(events::ApiDoc::openapi())
}
