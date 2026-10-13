use crate::state::AppState;
use axum::extract::FromRequestParts;
use axum::http::{header, request::Parts, StatusCode};

/// `Authorization: Bearer <API_INTERNAL_VERSION_POLICY_SECRET>`, nothing
/// fancier - this is called by CD (see
/// `.github/workflows/mobile-router.yml`), not reachable from the mobile
/// app or the public internet's intended surface. Same convention as
/// Recomend's `InternalVersionPolicyGuard`.
pub struct InternalSecretGuard;

impl FromRequestParts<AppState> for InternalSecretGuard {
    type Rejection = StatusCode;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let secret = state
            .config
            .api_internal_version_policy_secret
            .as_deref()
            .ok_or(StatusCode::UNAUTHORIZED)?;

        let provided = parts
            .headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .ok_or(StatusCode::UNAUTHORIZED)?;

        if provided != format!("Bearer {secret}") {
            return Err(StatusCode::UNAUTHORIZED);
        }

        Ok(Self)
    }
}
