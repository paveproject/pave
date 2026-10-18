use crate::app::me::devices::dto::{MeDevicesDeclinedResponse, MeDevicesResponse};
use crate::app::me::recovery_requests::dto::{
    MeRecoveryRequestsContactResponse, MeRecoveryRequestsResponse,
};
use crate::app::me::trusted_contacts::dto::{
    MeTrustedContactsAsContactResponse, MeTrustedContactsResponse,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Every event a user's personal channel (`/me/ws`) can push - one per
/// domain that needs to notify a specific user in realtime.
///
/// Variants carry the same shape the REST list endpoint would return for
/// that row, so the mobile client can merge it directly into its query
/// cache instead of invalidating and refetching. Also `Deserialize`:
/// round-trips through Redis pub/sub in plain JSON between pods.
// `event` tag (snake_case) is read standalone by the mobile client, with
// no enclosing `MeEventsUserEvent::` in sight - names stay self-describing
// rather than shortened for Rust-side ergonomics, hence the shared prefix.
#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum MeEventsUserEvent {
    TrustedContactAccepted(MeTrustedContactsResponse),
    /// To the *contact*: their share changed after the owner rotated the
    /// recovery key. Silent sync, no push job (would spam every contact).
    TrustedContactShareUpdated(MeTrustedContactsAsContactResponse),
    /// To the *contact*: the owner revoked them - clears their
    /// "as-contact" row live, since `list_as_contact` only returns
    /// `accepted` ones.
    TrustedContactRevoked(MeTrustedContactsAsContactResponse),
    /// To a user's *other* devices: a new one registered - triggers an
    /// immediate reconciliation pass to seal it a key copy.
    DeviceRegistered(MeDevicesResponse),
    /// To a user's own devices: one of them deposited a sealed recovery-key
    /// copy for a specific device - the target filters by `message.id`.
    DeviceDekUpdated(MeDevicesResponse),
    /// To a user's *other* devices: one of them approved a pending
    /// sibling - drops the row from every pending-approvals list live.
    DeviceApproved(MeDevicesResponse),
    /// To a user's *other* devices: one of them declined a pending
    /// sibling - same live drop, plus the declined device sees "declined".
    DeviceApprovalDeclined(MeDevicesDeclinedResponse),
    /// To every accepted trusted contact: the owner started a recovery
    /// request - shows up in their pending-approvals inbox live.
    RecoveryRequestCreated(MeRecoveryRequestsContactResponse),
    /// To the *owner's requesting device*: a contact approved or declined -
    /// drives the waiting screen's live "N of M responded" progress.
    RecoveryRequestContactResponded(MeRecoveryRequestsResponse),
    /// To every contact with a pending row: the owner cancelled the
    /// request - same live-drop reasoning as `TrustedContactRevoked`.
    RecoveryRequestCancelled(MeRecoveryRequestsContactResponse),
}
