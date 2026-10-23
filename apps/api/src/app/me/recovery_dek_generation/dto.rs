use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// See `handlers::reserve_recovery_dek_generation` - `expected_generation`
/// is the generation this device believes is currently active, read off
/// its own local `syncedState` before deciding to mint/re-seal anything.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeReserveRecoveryDekGenerationRequest {
    pub expected_generation: i32,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeRecoveryDekGenerationResponse {
    pub generation: i32,
}

/// Returned on a lost reservation (409) - `current_generation` is the
/// value actually stored server-side right now, already claimed by
/// whichever device won the race.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeRecoveryDekGenerationConflictResponse {
    pub current_generation: i32,
}
