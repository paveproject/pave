pub mod otp;
pub mod schema;

pub use otp::{OtpEmailSender, OtpPlugin, OtpPurpose};
pub use schema::AppAuthSchema;

/// `DATABASE_URL` points at the shared Postgres database (schema-first,
/// Drizzle-owned, auth schema included - see libs/db/src/lib/schemas/
/// auth.ts). This service reads/writes `auth`'s tables without knowing
/// Drizzle created them - pin the session's search_path to it first so
/// unqualified table names in the SeaORM entities above land there, with
/// `public` right after so apps/api's own unqualified entities
/// (e.g. `user`, `push_token`) still resolve on the same connection. No
/// table name collides between the two schemas, so the order only matters
/// as a tie-breaker that never actually triggers. `extensions` comes next -
/// where PostGIS/unaccent live (see `0002_create_slugify_function.sql`/
/// `0003_enable_postgis_extension.sql`). `system` comes last - its tables
/// (`system.config`) are reached via explicit schema-qualified raw SQL
/// elsewhere (see `system::service::is_maintenance`) and don't need it, but
/// its two Postgres *enum types* (`system.platform`,
/// `system.version_release_state`, used by the `version_policy` SeaORM
/// entity) do: unlike a table reference, there's no way to schema-qualify
/// an enum type in a parameterized query, so without `system` here, sqlx
/// fails to resolve either type with `type "platform" does not exist`
/// (42704) the moment anything writes to `version_policy`. This
/// connection-string `options` override replaces the database-level
/// default search_path those migrations set (it doesn't layer on top of
/// it), so every schema actually used on this connection has to be
/// repeated here, not just the ones with unqualified raw SQL.
pub fn database_url() -> String {
    let base = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let sep = if base.contains('?') { '&' } else { '?' };
    format!("{base}{sep}options=-csearch_path%3Dauth,public,extensions,system")
}
