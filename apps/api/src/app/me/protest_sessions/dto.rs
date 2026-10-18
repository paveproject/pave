use chrono::{DateTime, Utc};
use db_rs::sea_orm_active_enums::ProtestUploadKindEnum;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Mirrors the Postgres `protest_upload_kind_enum` (see
/// `libs/db/src/lib/schemas/protestSession.ts`) - same convention as
/// `me::push_token::dto::DeviceType`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum MeProtestUploadKind {
    PositionBatch,
    AudioChunk,
}

impl From<ProtestUploadKindEnum> for MeProtestUploadKind {
    fn from(value: ProtestUploadKindEnum) -> Self {
        match value {
            ProtestUploadKindEnum::PositionBatch => MeProtestUploadKind::PositionBatch,
            ProtestUploadKindEnum::AudioChunk => MeProtestUploadKind::AudioChunk,
        }
    }
}

impl From<MeProtestUploadKind> for ProtestUploadKindEnum {
    fn from(value: MeProtestUploadKind) -> Self {
        match value {
            MeProtestUploadKind::PositionBatch => ProtestUploadKindEnum::PositionBatch,
            MeProtestUploadKind::AudioChunk => ProtestUploadKindEnum::AudioChunk,
        }
    }
}

/// The session id in the path is client-supplied (the locally-generated
/// Watermelon id) - see `protest_session.rs`'s own doc comment for why.
/// `startedAt` is likewise the device's own recorded activation time, not
/// "now" - this can sync well after the fact (offline-first).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeProtestSessionCreateRequest {
    #[schema(value_type = String)]
    pub started_at: DateTime<Utc>,
}

/// Same reasoning as `startedAt` above: the device's own recorded end
/// time, not the server's "now" - otherwise a retried PATCH (after a
/// flaky connection ack) would push `endedAt` forward every time instead
/// of being a true no-op.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeProtestSessionEndRequest {
    #[schema(value_type = String)]
    pub ended_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeProtestSessionResponse {
    pub id: String,
    pub started_at: String,
    pub ended_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MeProtestUploadResponse {
    pub id: String,
    pub kind: MeProtestUploadKind,
}
