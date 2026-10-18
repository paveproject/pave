pub mod app;
pub mod config;
pub mod libs;
pub mod state;

use app::{auth_otp, health, internal, me, reports, system, webhooks};
use axum::Router;
use better_auth::integrations::axum::AxumIntegration;
use state::AppState;
use tower_http::cors::CorsLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

/// The full API's OpenAPI doc, assembled from each top-level module's own
/// slice (each of which may itself be assembled from its own
/// sub-modules' - see `me::openapi`) - this function is the *only* place
/// that needs to change when a whole new top-level module is added; a new
/// path/schema inside an existing one never touches this file at all.
pub fn build_openapi() -> utoipa::openapi::OpenApi {
    health::ApiDoc::openapi()
        .merge_from(system::ApiDoc::openapi())
        .merge_from(auth_otp::ApiDoc::openapi())
        .merge_from(me::openapi())
        .merge_from(reports::ApiDoc::openapi())
}

/// The real router, with real state plugged in - `main.rs` binds this to a
/// TCP listener; `apps/api/tests/*` mounts it directly (via
/// `tower::ServiceExt::oneshot`/an in-process listener) against test
/// Postgres/Redis containers instead, so a test exercises the exact same
/// routing/middleware a real request would, not a hand-rebuilt subset.
pub fn build_app(state: AppState) -> Router {
    Router::new()
        .merge(SwaggerUi::new("/docs").url("/openapi.json", build_openapi()))
        .route("/health", axum::routing::get(health::health_check))
        .route("/status", axum::routing::get(system::handlers::get_status))
        .nest(
            "/auth",
            state.auth.clone().axum_router_with_state::<AppState>(),
        )
        .nest("/me", me::router())
        .nest("/reports", reports::router())
        .nest(
            "/internal/version-policy",
            internal::version_policy::router(),
        )
        .nest(
            "/webhooks/app-store-connect",
            webhooks::app_store_connect::router(),
        )
        .with_state(state)
        .layer(CorsLayer::permissive())
}
