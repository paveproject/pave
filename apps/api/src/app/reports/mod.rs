pub mod dto;
pub mod geohash_util;
pub mod handlers;
pub mod hub;
pub mod rate_limit;
pub mod ws_dto;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

/// This module's own slice of the OpenAPI doc - merged into the top-level
/// one in `main.rs`, so adding a path/schema here never requires touching
/// that file.
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
