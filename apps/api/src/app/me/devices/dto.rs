use crate::app::me::push_token::dto::DeviceType;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Registers (or refreshes) the caller's current device - uniqueness is
/// on `(user_id, public_key)`, not the session, since the identity
/// keypair is generated once and persisted on-device, stable across
/// session rotations the way a session id itself isn't (see
/// `handlers::set_device`'s own doc comment).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetDeviceRequest {
    /// The caller's X25519 identity public key (hex), generated and
    /// held on-device - lets another user seal a Shamir share, or this
    /// user's *other* devices seal a direct copy of their own recovery
    /// key, so only this device can ever decrypt either.
    pub public_key: String,
    pub device_type: DeviceType,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DeviceResponse {
    pub id: String,
    pub public_key: String,
    pub device_type: DeviceType,
    /// A full seal (no Shamir split) of this user's own current recovery
    /// key to this device's public key, deposited by whichever sibling
    /// device currently holds it in plaintext - `None` until a sibling
    /// has caught this device up, or if this is the user's only device.
    pub encrypted_dek: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// Deposits a sealed copy of the caller's own recovery key for one of
/// their *other* devices (see `handlers::set_device_dek`) - never the
/// plaintext key itself, and never read by the server.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetDeviceDekRequest {
    pub encrypted_dek: String,
}
