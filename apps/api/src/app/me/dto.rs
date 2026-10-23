use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Merges the auth-owned fields (better-auth-rs) with Pave's own `user`
/// row (language, welcome flow, username cooldown).
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeResponse {
    pub id: String,
    pub email: Option<String>,
    pub email_verified: bool,
    pub name: Option<String>,
    pub username: String,
    pub image: Option<String>,
    pub language: String,
    pub welcomed_at: Option<String>,
    pub username_updated_at: Option<String>,
    /// "Mode manif" - toggled from the map screen, offline-first on the
    /// client. Swaps which of the two delays below applies to a new
    /// recovery request (see `recovery_requests::handlers::create_recovery_request`).
    pub protest_mode_enabled: bool,
    pub recovery_delay_seconds: i32,
    pub recovery_delay_protest_seconds: i32,
    /// Whether this account has set up the 3rd recovery path (a 24-word
    /// phrase - see `recovery_key_mnemonic::handlers`) - never the blob
    /// itself, just its presence, so the mobile welcome flow knows whether
    /// to generate a new one or skip straight through on a retry.
    pub has_recovery_phrase: bool,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeUpdateRequest {
    pub name: Option<String>,
    pub username: Option<String>,
    pub language: Option<String>,
    /// Set to `true` once to mark the post-signup welcome flow as seen.
    pub welcomed: Option<bool>,
    pub protest_mode_enabled: Option<bool>,
    /// Must stay strictly greater than `recovery_delay_protest_seconds`
    /// (whichever of the two is in effect after this update) - enforced in
    /// `update_me`, same invariant as the DB's own check constraint.
    pub recovery_delay_seconds: Option<i32>,
    pub recovery_delay_protest_seconds: Option<i32>,
}

/// Just enough about a registered device for ANOTHER user to seal
/// something to it - `id` is needed to target the right
/// `trusted_contact_share` row. Deliberately smaller than
/// `devices::dto::MeDevicesResponse` - no `encryptedDek`/timestamps.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeDeviceSummary {
    pub id: String,
    pub public_key: String,
}

/// A minimal, public-safe view of ANOTHER user - deliberately small, and
/// the one place to audit for "what do we expose about a user to other
/// users." Add a field only once a feature actually needs it.
///
/// Also `Deserialize`: embedded in realtime event payloads that round-trip
/// through Redis pub/sub (see `events::ws_dto`).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeProfile {
    pub id: String,
    pub username: String,
    pub image: Option<String>,
    /// Lets the other party in a trusted-contact relationship seal a
    /// Shamir share to every device without a separate lookup.
    pub devices: Vec<MeDeviceSummary>,
}

#[derive(Debug, Clone, Deserialize, utoipa::IntoParams)]
pub struct MeUsernameAvailableQuery {
    pub username: String,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeUsernameAvailableResponse {
    pub available: bool,
}
