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

/// A minimal, public-safe view of ANOTHER user - deliberately small (just
/// enough to label who someone is to someone else) so a new feature that
/// needs to reference a user defaults to not leaking more than that. Add
/// a field here (avatar, display name...) only once a feature actually
/// needs it, not speculatively - this struct is the one place that grows,
/// so it stays the single thing to audit for "what do we ever expose
/// about a user to other users".
///
/// Also `Deserialize`: embedded in `TrustedContactResponse`, which
/// round-trips through Redis pub/sub as part of the `trusted_contact_accepted`
/// realtime event (see `trusted_contacts::dto` and `events::ws_dto`).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub username: Option<String>,
    pub image: Option<String>,
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
