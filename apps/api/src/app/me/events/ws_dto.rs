use crate::app::me::trusted_contacts::dto::TrustedContactResponse;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Every event a user's personal channel (`/me/ws`) can push. One entry
/// per domain that needs to notify a specific user in realtime - add a
/// variant here, not a whole new hub, the next time one does (e.g. a
/// future manif-mode recovery-request notification).
///
/// Variants carry the same response shape the REST list endpoint would
/// return for that row (`TrustedContactResponse` here) rather than a
/// bespoke "something changed" payload, so the mobile client can merge the
/// row directly into its query cache (`setQueryData`) instead of
/// invalidating and refetching the whole list. Building that payload must
/// stay cheap/already-in-hand at the call site (no extra query beyond
/// what the mutation already touched) - see `redeem_invite`, which has
/// every field from the row it just updated plus `session.user.username`
/// for free - since it's built whether or not the owner is currently
/// connected to this channel.
///
/// Also `Deserialize`: round-trips through Redis pub/sub in plain JSON
/// between pods (see `hub.rs`), same reasoning as
/// `reports::ws_dto::ServerMessage`.
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum UserEvent {
    TrustedContactAccepted(TrustedContactResponse),
}
