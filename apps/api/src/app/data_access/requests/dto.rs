use crate::app::me::dto::MeProfile;
use db_rs::sea_orm_active_enums::{
    DataAccessRequestContactStatusEnum, DataAccessRequestStatusEnum,
};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// What the row stores. No `granted`: see `DataAccessState`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum DataAccessRequestStatus {
    Pending,
    Refused,
    Failed,
    Cancelled,
    /// Redundant with `expiresAt` - stored so the (owner, contact) pair is
    /// free to start a new request. See `close_if_expired`.
    Expired,
}

impl From<DataAccessRequestStatusEnum> for DataAccessRequestStatus {
    fn from(value: DataAccessRequestStatusEnum) -> Self {
        match value {
            DataAccessRequestStatusEnum::Pending => DataAccessRequestStatus::Pending,
            DataAccessRequestStatusEnum::Refused => DataAccessRequestStatus::Refused,
            DataAccessRequestStatusEnum::Failed => DataAccessRequestStatus::Failed,
            DataAccessRequestStatusEnum::Cancelled => DataAccessRequestStatus::Cancelled,
            DataAccessRequestStatusEnum::Expired => DataAccessRequestStatus::Expired,
        }
    }
}

/// Whether the request opens anything *right now*. Derived, never stored:
/// nothing runs on a timer, so a column would be a lie the moment `releaseAt`
/// or `expiresAt` passed. This is what a client should switch on.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum DataAccessState {
    /// Still collecting approvals, or inside the owner's veto window.
    Waiting,
    /// The owner's ciphertext is readable by the requester.
    Open,
    Refused,
    Failed,
    Expired,
    Cancelled,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum DataAccessRequestContactStatus {
    Pending,
    Approved,
    Declined,
}

impl From<DataAccessRequestContactStatusEnum> for DataAccessRequestContactStatus {
    fn from(value: DataAccessRequestContactStatusEnum) -> Self {
        match value {
            DataAccessRequestContactStatusEnum::Pending => DataAccessRequestContactStatus::Pending,
            DataAccessRequestContactStatusEnum::Approved => {
                DataAccessRequestContactStatus::Approved
            }
            DataAccessRequestContactStatusEnum::Declined => {
                DataAccessRequestContactStatus::Declined
            }
        }
    }
}

/// The shared view of a request, for both the owner and the requester.
///
/// Counts only, never *which* contact responded - same discipline as
/// `MeRecoveryRequestsResponse`, and for the same reason: knowing who refused
/// is social damage the server has no business causing.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DataAccessRequestResponse {
    pub id: String,
    pub status: DataAccessRequestStatus,
    /// What actually matters to a client - see `DataAccessState`.
    pub access: DataAccessState,
    pub owner: MeProfile,
    pub requester: MeProfile,
    pub release_at: String,
    pub expires_at: String,
    pub created_at: String,
    pub refused_at: Option<String>,
    pub failed_at: Option<String>,
    pub cancelled_at: Option<String>,
    /// Other accepted contacts asked. Excludes the requester - nobody votes
    /// on their own request.
    pub total_contacts: i32,
    pub approved_contacts: i32,
    pub declined_contacts: i32,
    /// Approvals needed: a strict majority of `total_contacts`, or 0 when the
    /// owner has no other contact (see `handlers::required_approvals`).
    pub required_approvals: i32,
}

/// What an asked contact sees in their pending-approvals inbox.
/// `requesting_device_public_key` is what their client re-seals its
/// already-held plaintext share to.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DataAccessRequestContactResponse {
    /// The `dataAccessRequestContact` row id, not the request's - this is
    /// specifically *this contact's* row on it.
    pub id: String,
    pub data_access_request_id: String,
    pub status: DataAccessRequestContactStatus,
    /// Whose recordings are being asked for.
    pub owner: MeProfile,
    /// Who is asking.
    pub requester: MeProfile,
    pub requesting_device_public_key: String,
    pub created_at: String,
}

/// Re-seals the contact's already-held plaintext share to the requesting
/// device's public key - blind to the server, same sealed-envelope convention
/// as `MeRecoveryRequestsApproveRequest`.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DataAccessRequestApproveRequest {
    pub encrypted_share: String,
}

/// One sealed share for the requester to combine. Handed over only once
/// access is `open`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct DataAccessRequestShareItem {
    pub encrypted_share: String,
}
