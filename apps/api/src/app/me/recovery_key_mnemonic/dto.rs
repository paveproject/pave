use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// See `handlers::set_recovery_key_mnemonic`. Opaque to the server - a
/// symmetric seal of the DEK under a key derived client-side from a
/// 24-word recovery phrase.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeRecoveryKeyMnemonicSetRequest {
    pub encrypted_dek: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeRecoveryKeyMnemonicResponse {
    pub encrypted_dek: String,
    pub created_at: String,
    pub updated_at: String,
}
