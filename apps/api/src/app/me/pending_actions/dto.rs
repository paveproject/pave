use crate::app::me::devices::dto::{MeDevicesResponse, MeOwnDeviceRegistrationResponse};
use crate::app::me::recovery_requests::dto::MeRecoveryRequestsContactResponse;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum MePendingAction {
    /// One of this user's own other devices, awaiting a bank-style
    /// approval from an already-`active` one.
    DeviceRegistration(MeDevicesResponse),
    /// Someone this user is a trusted contact *for*, asking them to
    /// release the Shamir share they're already holding.
    RecoveryRequestContact(MeRecoveryRequestsContactResponse),
    /// The flip side of `DeviceRegistration`: this device's own pending
    /// status, shown to itself while it waits.
    OwnDeviceRegistration(MeOwnDeviceRegistrationResponse),
}
