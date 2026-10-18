use crate::app::system::dto::AppPlatform;
use serde::Deserialize;

/// Not a `ToSchema` / not registered in `ApiDoc` - internal-only (CD
/// reporting a shipped release), never exposed in the public OpenAPI doc.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateVersionPolicyRequest {
    pub platform: AppPlatform,
    pub version: String,
    /// Whether this release is backwards-incompatible for API callers (a
    /// release-please MAJOR bump). Once the store confirms this version is
    /// live, `minVersion` is raised to it too, forcing older installs to
    /// update. When `false`, only `latestVersion` moves - a soft nudge,
    /// nobody's blocked.
    pub is_breaking: bool,
}
