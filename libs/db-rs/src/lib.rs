//! The SeaORM mirror of the Drizzle schema shared as `libs/db` on the TS
//! side (`libs/db/src/lib/schemas/*.ts`) - shared between `apps/api` and
//! `apps/notify` so both can query the same tables (devices, push tokens,
//! trusted contacts, recovery requests) without duplicating entity
//! definitions. Most of these are hand-written, not sea-orm-codegen
//! output - see `trusted_contact.rs`'s own header comment for why (dual
//! FKs to the same target, PostGIS columns codegen can't introspect, etc).

pub mod prelude;

pub mod device;
pub mod protest_session;
pub mod protest_upload;
pub mod push_token;
pub mod recovery_request;
pub mod recovery_request_contact;
pub mod sea_orm_active_enums;
pub mod trusted_contact;
pub mod trusted_contact_share;
pub mod user;
pub mod version_policy;
