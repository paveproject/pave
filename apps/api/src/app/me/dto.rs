use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// The current user, merging the auth-owned fields (better-auth-rs, see
/// libs/auth) with Pave's own `user` row (language, welcome flow, username
/// cooldown - see libs/db's Drizzle `user` schema for the TS equivalent).
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub id: String,
    pub email: Option<String>,
    pub email_verified: bool,
    pub name: Option<String>,
    pub username: Option<String>,
    pub image: Option<String>,
    pub language: String,
    pub welcomed_at: Option<String>,
    pub username_updated_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UpdateMeRequest {
    pub name: Option<String>,
    pub username: Option<String>,
    pub language: Option<String>,
    /// Set to `true` once to mark the post-signup welcome flow as seen.
    pub welcomed: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, utoipa::IntoParams)]
pub struct UsernameAvailableQuery {
    pub username: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct UsernameAvailableResponse {
    pub available: bool,
}
