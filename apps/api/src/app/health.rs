use axum::Json;
use serde::Serialize;
use utoipa::ToSchema;

#[derive(Serialize, ToSchema)]
pub struct HealthResponse {
    status: &'static str,
}

#[utoipa::path(
    get,
    path = "/health",
    responses((status = 200, description = "Service is healthy", body = HealthResponse))
)]
pub async fn health_check() -> Json<HealthResponse> {
    Json(HealthResponse { status: "ok" })
}
