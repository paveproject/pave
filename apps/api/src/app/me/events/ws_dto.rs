use crate::app::me::trusted_contacts::dto::{TrustedByResponse, TrustedContactResponse};
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
// The shared `TrustedContact*` prefix is deliberate, not an oversight -
// each variant's name is also its wire-format `event` tag (snake_case),
// read on its own by the mobile client with no enclosing `UserEvent::`
// path in sight, so it needs to stay self-describing rather than leaning
// on a shortened name real glob-import ergonomics would reward.
#[allow(clippy::enum_variant_names)]
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "event", rename_all = "snake_case")]
pub enum UserEvent {
    TrustedContactAccepted(TrustedContactResponse),
    /// Pushed to a *contact* (not the owner) when the owner rotates their
    /// recovery key and this contact's share changes as a result. Silent
    /// background sync, not a user-facing notification - no push job is
    /// enqueued alongside this one (unlike `TrustedContactAccepted`), or
    /// every rotation would spam every remaining contact.
    TrustedContactShareUpdated(TrustedByResponse),
    /// Pushed to a *contact* (not the owner) when the owner revokes them -
    /// carries the now-`revoked` row so the contact's "as-contact" list
    /// (and its locally decrypted share, see `useUserEventsSocket`) can be
    /// cleared live. `list_as_contact` only ever returns `accepted` rows,
    /// so without this the contact's cache would just silently keep the
    /// stale row until their next unrelated refetch happens to drop it.
    /// Same "no push job" reasoning as `TrustedContactShareUpdated`.
    TrustedContactRevoked(TrustedByResponse),
}
