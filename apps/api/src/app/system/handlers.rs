use super::dto::StatusResponse;
use super::headers::OptionalAppHeaders;
use super::service;
use crate::state::AppState;
use axum::extract::State;
use axum::Json;

#[utoipa::path(
    get,
    path = "/status",
    tag = "System",
    responses((
        status = 200,
        description = "Current system status: maintenance mode, and -- when the caller sent its \
            `x-app-platform`/`x-app-version` headers -- whether that app version is up to date, \
            has an optional update available, or must update before it can keep using the app \
            offline (nothing here ever blocks the request itself).",
        body = StatusResponse,
    ))
)]
pub async fn get_status(
    State(state): State<AppState>,
    OptionalAppHeaders(app): OptionalAppHeaders,
) -> Json<StatusResponse> {
    Json(service::get_status(&state.db, app).await)
}
