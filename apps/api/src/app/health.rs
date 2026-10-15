use axum::Json;
use serde::Serialize;
use utoipa::{OpenApi, ToSchema};

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    status: &'static str,
}

#[utoipa::path(
    get,
    path = "/health",
    tag = "Health",
    responses((status = 200, description = "Service is healthy", body = HealthResponse))
)]
pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}

/// This module's own slice of the OpenAPI doc - merged into the top-level
/// one in `main.rs`, so adding a path/schema here never requires touching
/// that file.
#[derive(OpenApi)]
#[openapi(paths(health_check), components(schemas(HealthResponse)))]
pub struct ApiDoc;
