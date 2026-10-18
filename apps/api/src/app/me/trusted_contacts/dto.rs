use super::super::dto::MeProfile;
use db_rs::sea_orm_active_enums::TrustedContactStatusEnum;
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

/// The raw code is never stored (only its hash) - same handling as an OTP.
/// `id` is the underlying `trusted_contact` row's id, so the client can
/// recognize the exact moment this code gets redeemed in its `mine` list.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsGenerateInviteResponse {
    pub id: String,
    pub code: String,
    pub expires_at: String,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsRedeemInviteRequest {
    pub code: String,
}

/// A contact with N devices needs N of these (same share, sealed once per
/// device - see `MeTrustedContactsAsContactQuery`).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsShareUpdate {
    /// Must be a `trusted_contact` relationship the caller owns.
    pub trusted_contact_id: String,
    pub device_id: String,
    pub encrypted_share: String,
}

/// The mobile app always recomputes the full set together on a rotation,
/// so one batch call beats N round trips.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsSetSharesRequest {
    pub shares: Vec<MeTrustedContactsShareUpdate>,
}

/// Which of the caller's devices is asking, to resolve each row's one
/// relevant `trusted_contact_share`. `Option` so an old client doesn't
/// 400 - it just gets rows with no `encrypted_share` resolved.
#[derive(Debug, Clone, Deserialize, utoipa::IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsAsContactQuery {
    pub device_id: Option<String>,
}

/// A contact the caller has designated (as owner). Also `Deserialize`:
/// reused as the `trusted_contact_accepted` realtime event payload.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsResponse {
    pub id: String,
    pub status: TrustedContactStatus,
    /// `None` while still `pending` (unredeemed) - distinct from
    /// "redeemed, no username set" (`Some(MeProfile { username: None, .. })`).
    pub contact: Option<MeProfile>,
    pub created_at: String,
}

/// The reverse of `MeTrustedContactsResponse` - whose safety net the
/// caller is part of. Also reused as the `trusted_contact_share_updated`
/// realtime event payload.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsAsContactResponse {
    pub id: String,
    pub status: TrustedContactStatus,
    pub owner: MeProfile,
    pub created_at: String,
    /// Sealed (hex) to the requesting device - the server stores and
    /// serves this but can't read it. `None` until split, or if the
    /// request didn't name a `device_id`.
    pub encrypted_share: Option<String>,
}
