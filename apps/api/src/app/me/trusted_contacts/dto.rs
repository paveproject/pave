use super::super::dto::Profile;
use crate::libs::entities::sea_orm_active_enums::TrustedContactStatusEnum;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum TrustedContactStatus {
    Pending,
    Accepted,
    Declined,
    Revoked,
}

impl From<TrustedContactStatusEnum> for TrustedContactStatus {
    fn from(value: TrustedContactStatusEnum) -> Self {
        match value {
            TrustedContactStatusEnum::Pending => TrustedContactStatus::Pending,
            TrustedContactStatusEnum::Accepted => TrustedContactStatus::Accepted,
            TrustedContactStatusEnum::Declined => TrustedContactStatus::Declined,
            TrustedContactStatusEnum::Revoked => TrustedContactStatus::Revoked,
        }
    }
}

/// The raw code is never stored (only its hash) and never returned again
/// after this response - same handling as an OTP.
///
/// `id` is the underlying `trusted_contact` row's id (same `id` a
/// `TrustedContactResponse` would carry once accepted) - lets the mobile
/// client that generated this invite recognize, from the live `mine`
/// list it's already watching, the exact moment *this* code gets redeemed
/// (see the "add" screen's auto-regenerate-on-accept behavior) without
/// guessing from list-length changes.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct GenerateInviteResponse {
    pub id: String,
    pub code: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct RedeemInviteRequest {
    pub code: String,
}

/// One contact's new sealed share, as part of a `SetSharesRequest` batch.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ShareUpdate {
    /// The `trusted_contact` relationship this share belongs to - must be
    /// one the caller owns.
    pub id: String,
    pub encrypted_share: String,
}

/// Uploads every contact's share in one request - the mobile app always
/// recomputes the full set together (see `trustedContact.encryptedShare`'s
/// own doc comment on why a rotation touches everyone's share at once),
/// so one batch call beats N round trips.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetSharesRequest {
    pub shares: Vec<ShareUpdate>,
}

/// A contact the caller has designated (as owner).
///
/// Also `Deserialize`: reused as-is for the `trusted_contact_accepted`
/// realtime event payload (see `app::me::events::ws_dto::UserEvent`), which
/// round-trips through Redis pub/sub in plain JSON between pods.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TrustedContactResponse {
    pub id: String,
    pub status: TrustedContactStatus,
    /// `None` while still `pending` - nobody has redeemed the code yet.
    /// Distinct from "redeemed but has no username set" (`Some(Profile {
    /// username: None, .. })`), which the old flat `contact_username`
    /// field couldn't tell apart from "still pending".
    pub contact: Option<Profile>,
    pub created_at: String,
}

/// A relationship where the caller is the one trusted (the reverse of
/// `TrustedContactResponse`) - a contact needs to know whose safety net
/// they're part of.
///
/// Also `Deserialize`: reused as-is for the `trusted_contact_share_updated`
/// realtime event payload (see `events::ws_dto::UserEvent`), same reasoning
/// as `TrustedContactResponse`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct TrustedByResponse {
    pub id: String,
    pub status: TrustedContactStatus,
    pub owner: Profile,
    pub created_at: String,
    /// The caller's current Shamir share of the owner's recovery key,
    /// sealed (hex) to the caller's own public key - the server
    /// stores and serves this but can't read it. `None` until the owner
    /// has generated a recovery key and split it across their accepted
    /// contacts.
    pub encrypted_share: Option<String>,
}
