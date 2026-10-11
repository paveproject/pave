use axum::extract::FromRequestParts;
use axum::http::{header, request::Parts, StatusCode};

/// `Authorization: Bearer <API_INTERNAL_VERSION_POLICY_SECRET>`, nothing
/// fancier - this is called by CD (see
/// `.github/workflows/mobile-router.yml`), not reachable from the mobile
/// app or the public internet's intended surface. Same convention as
/// Recomend's `InternalVersionPolicyGuard`.
pub struct InternalSecretGuard;

impl<S> FromRequestParts<S> for InternalSecretGuard
where
    S: Send + Sync,
{
    type Rejection = StatusCode;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let secret = std::env::var("API_INTERNAL_VERSION_POLICY_SECRET")
            .map_err(|_| StatusCode::UNAUTHORIZED)?;

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
