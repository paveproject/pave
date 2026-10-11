use super::dto::UpdateVersionPolicyRequest;
use super::guard::InternalSecretGuard;
use crate::app::system::service::{self, UpdateVersionPolicyError};
use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;

pub async fn report_version(
    State(state): State<AppState>,
    _guard: InternalSecretGuard,
    Json(body): Json<UpdateVersionPolicyRequest>,
) -> StatusCode {
    match service::update_version_policy(&state.db, body.platform, body.version, body.is_breaking)
        .await
    {
        Ok(()) => StatusCode::OK,
        Err(UpdateVersionPolicyError::InvalidVersion) => StatusCode::BAD_REQUEST,
        Err(UpdateVersionPolicyError::Db(err)) => {
            tracing::error!(%err, "failed to record version policy");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}
