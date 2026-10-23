pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::post;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/reserve", post(handlers::reserve_recovery_dek_generation))
}

/// Merged into `me::openapi` - no `main.rs` change needed to add a
/// path/schema here.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(handlers::reserve_recovery_dek_generation),
    components(schemas(
        dto::MeReserveRecoveryDekGenerationRequest,
        dto::MeRecoveryDekGenerationResponse,
        dto::MeRecoveryDekGenerationConflictResponse
    ))
)]
pub struct ApiDoc;
