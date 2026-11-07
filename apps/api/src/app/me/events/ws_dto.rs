use crate::app::data_access::requests::dto::{
    DataAccessRequestContactResponse, DataAccessRequestResponse,
};
use crate::app::devices::dto::{MeDevicesDeclinedResponse, MeDevicesResponse};
use crate::app::recovery_requests::dto::{
    MeRecoveryRequestsContactResponse, MeRecoveryRequestsResponse,
};
use crate::app::trusted_contacts::dto::{
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
    /// To the **owner**. The only event here that also enqueues a push: their
    /// chance to refuse is bounded by `releaseAt`.
    DataAccessRequested(DataAccessRequestResponse),
    /// To each *other* accepted contact, asked to release the share they hold.
    DataAccessRequestAsked(DataAccessRequestContactResponse),
    /// To the owner **and** the requester: a contact approved or declined.
    /// Never fires at `releaseAt` - nothing runs on a timer, and the client
    /// has the timestamp (see `useOwnerDataAccess`'s scheduled refetch).
    DataAccessRequestUpdated(DataAccessRequestResponse),
    /// To both parties and every asked contact: the request is over.
    DataAccessRequestClosed(DataAccessRequestResponse),
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Renaming a variant is a silent break: the client switches on these
    /// strings (`useUserEventsSocket.ts`), so the socket keeps delivering and
    /// the client keeps ignoring.
    #[test]
    fn data_access_events_keep_their_wire_names() {
        let tag_of = |event: MeEventsUserEvent| {
            serde_json::to_value(&event).expect("serialises")["event"]
                .as_str()
                .expect("tagged")
                .to_string()
        };
        let response = sample_response();

        assert_eq!(
            tag_of(MeEventsUserEvent::DataAccessRequested(response.clone())),
            "data_access_requested"
        );
        assert_eq!(
            tag_of(MeEventsUserEvent::DataAccessRequestUpdated(
                response.clone()
            )),
            "data_access_request_updated"
        );
        assert_eq!(
            tag_of(MeEventsUserEvent::DataAccessRequestClosed(response)),
            "data_access_request_closed"
        );
    }

    /// Merged straight into the client's query cache, so the field names
    /// matter as much as the tag.
    #[test]
    fn a_data_access_payload_is_camel_case() {
        let value = serde_json::to_value(MeEventsUserEvent::DataAccessRequested(sample_response()))
            .expect("serialises");

        for key in [
            "releaseAt",
            "expiresAt",
            "totalContacts",
            "approvedContacts",
            "requiredApprovals",
        ] {
            assert!(value.get(key).is_some(), "missing {key} in {value}");
        }
        assert_eq!(value["access"], "waiting");
    }

    fn sample_response() -> DataAccessRequestResponse {
        use crate::app::data_access::requests::dto::{DataAccessRequestStatus, DataAccessState};

        let profile = crate::app::me::dto::MeProfile {
            id: "u".to_string(),
            username: "someone".to_string(),
            image: None,
            devices: Vec::new(),
        };
        DataAccessRequestResponse {
            id: "11111111-1111-1111-1111-111111111111".to_string(),
            status: DataAccessRequestStatus::Pending,
            access: DataAccessState::Waiting,
            owner: profile.clone(),
            requester: profile,
            release_at: "2026-11-07T10:00:00+00:00".to_string(),
            expires_at: "2026-11-14T10:00:00+00:00".to_string(),
            created_at: "2026-11-07T08:00:00+00:00".to_string(),
            refused_at: None,
            failed_at: None,
            cancelled_at: None,
            total_contacts: 1,
            approved_contacts: 0,
            declined_contacts: 0,
            required_approvals: 1,
        }
    }
}
