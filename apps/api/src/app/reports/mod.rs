pub mod dto;
pub mod geohash_util;
pub mod grouping;
pub mod handlers;
pub mod hub;
pub mod rate_limit;
pub mod ws_dto;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

/// Merged into the top-level OpenAPI doc in `main.rs`.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(handlers::create_report, handlers::list_reports),
    components(schemas(
        dto::ReportType,
        dto::ReportsCreateRequest,
        dto::ReportsResponse,
        ws_dto::ReportsClientMessage,
        ws_dto::ReportsServerMessage
    ))
)]
pub struct ApiDoc;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(handlers::list_reports).post(handlers::create_report),
        )
        .route("/ws", get(handlers::reports_ws))
}
