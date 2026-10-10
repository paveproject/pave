use crate::entities::sea_orm_active_enums::ReportTypeEnum;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

/// Mirrors the Postgres `report_type_enum` (see
/// `libs/db/src/lib/schemas/report.ts`) - a separate wire-facing enum rather
/// than exposing `ReportTypeEnum` directly, same convention as
/// `me::push_token::dto::DeviceType`/`PushProvider`.
#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ReportType {
    TearGas,
    PolicePresence,
    Arrest,
    Violence,
    RoadBlock,
    Medical,
    WaterCannon,
    /// "Nasse" in French - police encircling and containing a crowd.
    Kettling,
    Other,
}

impl From<ReportType> for ReportTypeEnum {
    fn from(value: ReportType) -> Self {
        match value {
            ReportType::TearGas => ReportTypeEnum::TearGas,
            ReportType::PolicePresence => ReportTypeEnum::PolicePresence,
            ReportType::Arrest => ReportTypeEnum::Arrest,
            ReportType::Violence => ReportTypeEnum::Violence,
            ReportType::RoadBlock => ReportTypeEnum::RoadBlock,
            ReportType::Medical => ReportTypeEnum::Medical,
            ReportType::WaterCannon => ReportTypeEnum::WaterCannon,
            ReportType::Kettling => ReportTypeEnum::Kettling,
            ReportType::Other => ReportTypeEnum::Other,
        }
    }
}

impl From<ReportTypeEnum> for ReportType {
    fn from(value: ReportTypeEnum) -> Self {
        match value {
            ReportTypeEnum::TearGas => ReportType::TearGas,
            ReportTypeEnum::PolicePresence => ReportType::PolicePresence,
            ReportTypeEnum::Arrest => ReportType::Arrest,
            ReportTypeEnum::Violence => ReportType::Violence,
            ReportTypeEnum::RoadBlock => ReportType::RoadBlock,
            ReportTypeEnum::Medical => ReportType::Medical,
            ReportTypeEnum::WaterCannon => ReportType::WaterCannon,
            ReportTypeEnum::Kettling => ReportType::Kettling,
            ReportTypeEnum::Other => ReportType::Other,
        }
    }
}

/// `id` is always client-generated (a UUID minted offline, before any server
/// round-trip is possible) - WatermelonDB re-pushes unsynced rows on every
/// reconnect, so creating the same report twice must be a no-op, not a
/// duplicate (enforced by the handler via `ON CONFLICT (id) DO NOTHING`).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct CreateReportRequest {
    pub id: String,
    pub r#type: ReportType,
    pub lat: f64,
    pub lng: f64,
    /// When the situation actually happened, as recorded by the device -
    /// not necessarily now (this can be well in the past by the time it
    /// syncs, that's the whole point of offline-first).
    #[schema(value_type = String)]
    pub occurred_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReportResponse {
    pub id: String,
    pub r#type: ReportType,
    pub lat: f64,
    pub lng: f64,
    pub occurred_at: String,
    pub expires_at: String,
}

/// Bounding box scoping the map's visible viewport - without this, every
/// client would pull every report on earth on every refresh.
#[derive(Debug, Clone, Deserialize, IntoParams)]
#[serde(rename_all = "camelCase")]
pub struct ListReportsQuery {
    pub min_lat: f64,
    pub min_lng: f64,
    pub max_lat: f64,
    pub max_lng: f64,
}
