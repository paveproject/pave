//! Read on `/status` only, no enforcement middleware here - the mobile app
//! sends these headers on every request anyway, so the API already has
//! them available for future per-version logging.

use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use std::convert::Infallible;

use super::dto::AppPlatform;

pub const APP_PLATFORM_HEADER: &str = "x-app-platform";
pub const APP_VERSION_HEADER: &str = "x-app-version";

#[derive(Debug, Clone)]
pub struct AppHeaders {
    pub platform: AppPlatform,
    pub version: String,
}

/// `None` when the caller didn't send both headers, or sent an unrecognized
/// platform - never a rejection, so a route using this extractor can never
/// fail a request just because the caller is an older client (or a plain
/// `curl`) that doesn't know about these headers yet.
pub struct OptionalAppHeaders(pub Option<AppHeaders>);

impl<S> FromRequestParts<S> for OptionalAppHeaders
where
    S: Send + Sync,
{
    type Rejection = Infallible;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        let platform = parts
            .headers
            .get(APP_PLATFORM_HEADER)
            .and_then(|v| v.to_str().ok())
            .and_then(AppPlatform::parse);
        let version = parts
            .headers
            .get(APP_VERSION_HEADER)
            .and_then(|v| v.to_str().ok())
            .filter(|v| !v.is_empty());

        let app = match (platform, version) {
            (Some(platform), Some(version)) => Some(AppHeaders {
                platform,
                version: version.to_string(),
            }),
            _ => None,
        };

        Ok(OptionalAppHeaders(app))
    }
}
