use crate::app::me::dto::MeProfile;
use db_rs::sea_orm_active_enums::{RecoveryRequestContactStatusEnum, RecoveryRequestStatusEnum};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum MeRecoveryRequestsStatus {
    Pending,
    Completed,
    Cancelled,
    /// Every asked contact has responded and none approved - the one
    /// failure case the server can actually detect (see
    /// `handlers::is_unrecoverable`).
    Failed,
}

impl From<RecoveryRequestStatusEnum> for MeRecoveryRequestsStatus {
    fn from(value: RecoveryRequestStatusEnum) -> Self {
        match value {
            RecoveryRequestStatusEnum::Pending => MeRecoveryRequestsStatus::Pending,
            RecoveryRequestStatusEnum::Completed => MeRecoveryRequestsStatus::Completed,
            RecoveryRequestStatusEnum::Cancelled => MeRecoveryRequestsStatus::Cancelled,
            RecoveryRequestStatusEnum::Failed => MeRecoveryRequestsStatus::Failed,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum MeRecoveryRequestsContactStatus {
    Pending,
    Approved,
    Declined,
}

impl From<RecoveryRequestContactStatusEnum> for MeRecoveryRequestsContactStatus {
    fn from(value: RecoveryRequestContactStatusEnum) -> Self {
        match value {
            RecoveryRequestContactStatusEnum::Pending => MeRecoveryRequestsContactStatus::Pending,
            RecoveryRequestContactStatusEnum::Approved => MeRecoveryRequestsContactStatus::Approved,
            RecoveryRequestContactStatusEnum::Declined => MeRecoveryRequestsContactStatus::Declined,
        }
    }
}

/// The owner's own view of their request - counts only, deliberately
/// never *which* contact responded, never the sealed shares themselves
/// (see `handlers::list_recovery_request_shares`), and never the Shamir
/// threshold (lives only inside each sealed envelope - the server was
/// never told it and never needs to be).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeRecoveryRequestsResponse {
    pub id: String,
    pub status: MeRecoveryRequestsStatus,
    pub release_at: String,
    pub created_at: String,
    pub completed_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub failed_at: Option<String>,
    pub total_contacts: i32,
    pub approved_contacts: i32,
    pub declined_contacts: i32,
}

/// What a trusted contact sees in their pending-approvals inbox and
/// approves/declines against. `requesting_device_public_key` is what
/// their client re-seals its already-held plaintext share to.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeRecoveryRequestsContactResponse {
    /// The `recoveryRequestContact` row id - not the request's own id,
    /// since this is specifically *this contact's* row on it.
    pub id: String,
    pub recovery_request_id: String,
    pub status: MeRecoveryRequestsContactStatus,
    pub owner: MeProfile,
    pub requesting_device_public_key: String,
    pub created_at: String,
}

/// Re-seals the contact's already-held plaintext share to the requesting
/// device's public key - still blind to the server, same sealed-envelope
/// convention as `trusted_contacts::dto::MeTrustedContactsShareUpdate`.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeRecoveryRequestsApproveRequest {
    pub encrypted_share: String,
}

/// One sealed share, still blind to the server - the owner's requesting
/// device `unseal()`s each with its own private key once `GET .../shares`
/// starts returning them (after `releaseAt`).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeRecoveryRequestsShareItem {
    pub trusted_contact_id: String,
    pub encrypted_share: String,
}
