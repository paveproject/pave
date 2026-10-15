use super::super::dto::MeProfile;
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
/// `MeTrustedContactsResponse` would carry once accepted) - lets the mobile
/// client that generated this invite recognize, from the live `mine`
/// list it's already watching, the exact moment *this* code gets redeemed
/// (see the "add" screen's auto-regenerate-on-accept behavior) without
/// guessing from list-length changes.
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

/// One contact device's new sealed share, as part of a
/// `MeTrustedContactsSetSharesRequest` batch - a contact with N devices
/// needs N of these (the same share value, sealed once per device), since
/// each only gets resolved back out to the device that asks for it (see
/// `MeTrustedContactsAsContactQuery`).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsShareUpdate {
    /// The `trusted_contact` relationship this share belongs to - must be
    /// one the caller owns.
    pub trusted_contact_id: String,
    /// Which of that contact's registered devices this copy is sealed
    /// for.
    pub device_id: String,
    pub encrypted_share: String,
}

/// Uploads every contact device's share in one request - the mobile app
/// always recomputes the full set together (see
/// `trustedContactShare`'s own doc comment on why a rotation touches
/// everyone's shares at once), so one batch call beats N round trips.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsSetSharesRequest {
    pub shares: Vec<MeTrustedContactsShareUpdate>,
}

/// `GET /me/trusted-contacts/as-contact` needs to know which of the
/// caller's own devices is asking, to resolve each row's one relevant
/// `trusted_contact_share` out of potentially several (one per device
/// they have registered). `Option` so an old, not-yet-upgraded client
/// doesn't 400 - it just gets rows with no `encrypted_share` resolved.
#[derive(Debug, Clone, Deserialize, utoipa::IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsAsContactQuery {
    pub device_id: Option<String>,
}

/// A contact the caller has designated (as owner).
///
/// Also `Deserialize`: reused as-is for the `trusted_contact_accepted`
/// realtime event payload (see `app::me::events::ws_dto::MeEventsUserEvent`), which
/// round-trips through Redis pub/sub in plain JSON between pods.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsResponse {
    pub id: String,
    pub status: TrustedContactStatus,
    /// `None` while still `pending` - nobody has redeemed the code yet.
    /// Distinct from "redeemed but has no username set" (`Some(MeProfile {
    /// username: None, .. })`), which the old flat `contact_username`
    /// field couldn't tell apart from "still pending".
    pub contact: Option<MeProfile>,
    pub created_at: String,
}

/// A relationship where the caller is the one trusted (the reverse of
/// `MeTrustedContactsResponse`) - a contact needs to know whose safety net
/// they're part of.
///
/// Also `Deserialize`: reused as-is for the `trusted_contact_share_updated`
/// realtime event payload (see `events::ws_dto::MeEventsUserEvent`), same reasoning
/// as `MeTrustedContactsResponse`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeTrustedContactsAsContactResponse {
    pub id: String,
    pub status: TrustedContactStatus,
    pub owner: MeProfile,
    pub created_at: String,
    /// The caller's current Shamir share of the owner's recovery key,
    /// sealed (hex) to the *requesting device's* public key (see
    /// `MeTrustedContactsAsContactQuery`) - the server stores and serves
    /// this but can't read it. `None` until the owner has generated a
    /// recovery key and split it across their accepted contacts, or if
    /// the request didn't name a `device_id`.
    pub encrypted_share: Option<String>,
}
