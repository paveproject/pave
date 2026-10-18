use super::dto::{ReportsListQuery, ReportsResponse};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Reuses `ReportsListQuery` - same bbox shape as the REST fetch. Tagged
/// on `event`, not `type` - `ReportsResponse` already has its own `type`
/// field, and tagging on a name that collides with the payload's own
/// field collapses to `never` on the generated TS side.
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum ReportsClientMessage {
    /// Replaces this connection's current viewport subscription. Sent on
    /// connect and again whenever the map's visible bounds change.
    Subscribe(ReportsListQuery),
}

/// Reuses `ReportsResponse` as the payload. Also `Deserialize`: round-trips
/// through Redis pub/sub between pods (see `hub.rs`), not just to the client.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum ReportsServerMessage {
    ReportCreated(ReportsResponse),
}
