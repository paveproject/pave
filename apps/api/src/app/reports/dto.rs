use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::{IntoParams, ToSchema};

/// Websocket events carry single reports, which are always a concrete type.
fn default_kind() -> String {
    "type".to_string()
}

/// `id` is always client-generated (a UUID minted offline, before any server
/// round-trip is possible) - WatermelonDB re-pushes unsynced rows on every
/// reconnect, so creating the same report twice must be a no-op, not a
/// duplicate (enforced by the handler via `ON CONFLICT (id) DO NOTHING`).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReportsCreateRequest {
    pub id: String,
    /// A `report_type.key` (see `libs/db/src/lib/schemas/report.ts`), not a
    /// closed enum: the taxonomy is a table because it grows and varies by
    /// country, so validating the key is the handler's job now.
    pub r#type: String,
    pub lat: f64,
    pub lng: f64,
    /// When the situation actually happened, as recorded by the device -
    /// not necessarily now (this can be well in the past by the time it
    /// syncs, that's the whole point of offline-first).
    #[schema(value_type = String)]
    pub occurred_at: DateTime<Utc>,
}

/// Also `Deserialize`: round-trips through Redis pub/sub in plain JSON
/// between pods as part of `ws_dto::ReportsServerMessage` (see `hub.rs`).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReportsResponse {
    pub id: String,
    /// A `report_type.key`, see `ReportsCreateRequest::type` - or a
    /// `report_family.key` when `kind` is `family`.
    pub r#type: String,
    /// `"family"` or `"type"`: which level `type` names. Needed because the
    /// key alone can't say - `other` is both a family and a type.
    #[serde(default = "default_kind")]
    pub kind: String,
    pub lat: f64,
    pub lng: f64,
    pub occurred_at: String,
    pub expires_at: String,
    /// How many reports this marker stands for - everything of the same
    /// family (or type, when zoomed in) inside one grid cell. `1` when the
    /// cell holds a single report.
    pub count: u32,
}

/// Bounding box scoping the map's visible viewport - without this, every
/// client would pull every report on earth on every refresh. Also used as
/// the websocket subscribe payload (see `ws_dto::ReportsClientMessage`), hence
/// `ToSchema` alongside `IntoParams`.
#[derive(Debug, Clone, Deserialize, IntoParams, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct ReportsListQuery {
    pub min_lat: f64,
    pub min_lng: f64,
    pub max_lat: f64,
    pub max_lng: f64,
}
