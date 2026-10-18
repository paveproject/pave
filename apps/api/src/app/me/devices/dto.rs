use crate::app::me::push_token::dto::DeviceType;
use db_rs::sea_orm_active_enums::DeviceStatusEnum;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// `pending`: awaiting sibling or recovery approval. `active`: approved,
/// or never needed it (account's first device).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum MeDevicesStatus {
    Pending,
    Active,
}

impl From<DeviceStatusEnum> for MeDevicesStatus {
    fn from(value: DeviceStatusEnum) -> Self {
        match value {
            DeviceStatusEnum::Pending => MeDevicesStatus::Pending,
            DeviceStatusEnum::Active => MeDevicesStatus::Active,
        }
    }
}

/// See `handlers::set_device`.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeDevicesSetRequest {
    /// X25519 identity public key (hex), generated and held on-device.
    pub public_key: String,
    pub device_type: DeviceType,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeDevicesResponse {
    pub id: String,
    pub public_key: String,
    pub device_type: DeviceType,
    pub status: MeDevicesStatus,
    /// Sealed copy of the recovery key, deposited by a sibling device -
    /// `None` until synced, or if this is the only device.
    pub encrypted_dek: Option<String>,
    /// Coarse IP geolocation, `None` once approved (see
    /// `handlers::approve_device`) or if unresolved. Approximate only - UI
    /// must label it as such.
    pub location_city: Option<String>,
    pub location_country: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// See `handlers::set_device_dek`.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeDevicesSetDekRequest {
    pub encrypted_dek: String,
}

/// The row is gone (see `handlers::decline_device`) - just an id to
/// confirm which one.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeDevicesDeclinedResponse {
    pub id: String,
}

/// The waiting side of `MePendingAction` - what *this* device sees while
/// pending, not what a sibling sees to approve it.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeOwnDeviceRegistrationResponse {
    pub id: String,
    pub device_type: DeviceType,
    pub approver_devices: Vec<MeDevicesResponse>,
    pub created_at: String,
    /// Bumped on every `PUT /me/devices` - lets the mobile dedup gate
    /// re-present this after a "resend request" tap, since the id itself
    /// never changes while pending.
    pub updated_at: String,
}
