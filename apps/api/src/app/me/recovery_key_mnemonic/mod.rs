pub mod dto;
pub mod handlers;

use crate::state::AppState;
use axum::routing::{get, post};
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/",
            get(handlers::get_recovery_key_mnemonic).put(handlers::set_recovery_key_mnemonic),
        )
        .route(
            "/activate",
            post(handlers::activate_via_recovery_key_mnemonic),
        )
}

/// Merged into `me::openapi` - no `main.rs` change needed to add a
/// path/schema here.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(
        handlers::set_recovery_key_mnemonic,
        handlers::get_recovery_key_mnemonic,
        handlers::activate_via_recovery_key_mnemonic
    ),
    components(schemas(
        dto::MeRecoveryKeyMnemonicSetRequest,
        dto::MeRecoveryKeyMnemonicResponse
    ))
)]
pub struct ApiDoc;
