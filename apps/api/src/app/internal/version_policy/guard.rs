use crate::state::AppState;
use axum::extract::FromRequestParts;
use axum::http::{header, request::Parts, StatusCode};
use subtle::ConstantTimeEq;

/// `Authorization: Bearer <API_INTERNAL_VERSION_POLICY_SECRET>` - called
/// by CD, not meant for the mobile app or public use.
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

        let expected = format!("Bearer {secret}");
        if !bool::from(provided.as_bytes().ct_eq(expected.as_bytes())) {
            return Err(StatusCode::UNAUTHORIZED);
        }

        Ok(Self)
    }
}
