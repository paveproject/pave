use super::dto::{ReportsListQuery, ReportsResponse};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Messages a client sends over `/reports/ws`. Reuses `ReportsListQuery` -
/// the same bbox shape already used for the REST fetch - rather than
/// inventing a second bbox type.
///
/// Tagged on `event`, not `type` - `ReportsResponse` already has its own
/// `type` field (the report's category), and internally-tagging on a key
/// name that collides with an existing field of the payload is a conflict
/// (and would collapse to `never` on the generated TS side - caught via
/// `ReportsServerMessage` below, same reasoning applies here for consistency).
#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum ReportsClientMessage {
    /// Replaces this connection's current viewport subscription. Sent on
    /// connect and again whenever the map's visible bounds change.
    Subscribe(ReportsListQuery),
}

/// Messages the server pushes to a subscribed client. Reuses
/// `ReportsResponse` - the same shape already returned by the REST
/// endpoints - as the payload.
///
/// Also `Deserialize`: these round-trip through Redis pub/sub in plain JSON
/// between pods (see `hub.rs`), not just out to the websocket client.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum ReportsServerMessage {
    ReportCreated(ReportsResponse),
}
