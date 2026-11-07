use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Creates a session, or returns the one already stored under this id.
///
/// `id` travels in the path because it is minted on the device, so a replayed
/// push lands on the same row instead of creating a second one.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProtestSessionUpsertRequest {
    /// This session's symmetric key, sealed under the account's recovery DEK.
    /// Opaque: the server cannot open it and never needs to.
    pub sealed_key: String,
    /// Encrypted envelope holding the session's timestamps and settings. Not
    /// columns: a cleartext `started_at` would tell the server when this
    /// account was at a protest.
    pub metadata: String,
}

/// Closes a session. `metadata` is replaced wholesale, being one opaque
/// blob - the client re-seals it with the end time in place.
#[derive(Debug, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProtestSessionEndRequest {
    pub metadata: String,
}

#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProtestBlobResponse {
    pub id: String,
    /// `position_batch`, `audio_chunk` or `video_chunk`.
    pub kind: String,
    pub size: i32,
    /// Position within the session: the only ordering available, there being
    /// no cleartext timestamp on either table.
    pub seq: i32,
}

/// `s3_key` is absent on purpose: an internal detail, and the client
/// addresses a blob by its own id.
#[derive(Debug, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ProtestSessionResponse {
    pub id: String,
    /// Whose recording this is.
    ///
    /// Only ever served to a caller the read gate already let through - the
    /// owner, or a contact holding an open grant - so it tells them nothing
    /// they did not already know. What it buys is a session id that is
    /// self-sufficient: the client no longer has to be told whose key to
    /// reach for, which is what lets one route serve both cases.
    pub owner_user_id: String,
    pub active: bool,
    pub sealed_key: String,
    pub metadata: String,
    pub blobs: Vec<ProtestBlobResponse>,
}
