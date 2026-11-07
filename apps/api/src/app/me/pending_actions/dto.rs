use crate::app::data_access::requests::dto::{
    DataAccessRequestContactResponse, DataAccessRequestResponse,
};
use crate::app::devices::dto::{MeDevicesResponse, MeOwnDeviceRegistrationResponse};
use crate::app::recovery_requests::dto::MeRecoveryRequestsContactResponse;
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
    /// Another contact of the same owner is asking to read that owner's
    /// recordings, and this user's approval is part of the quorum.
    DataAccessRequestContact(DataAccessRequestContactResponse),
    /// To the **owner**. The one kind that asks for nothing: it is a veto
    /// window, and dismissing it is a valid answer. In this feed anyway
    /// because a request the owner never saw is one they could not refuse.
    DataAccessRequestOwner(DataAccessRequestResponse),
}
