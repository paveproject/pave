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
/// as a tie-breaker that never actually triggers. `extensions` comes last -
/// where PostGIS/unaccent live (see `0002_create_slugify_function.sql`/
/// `0003_enable_postgis_extension.sql`) - this connection-string `options`
/// override replaces the database-level default search_path those
/// migrations set (it doesn't layer on top of it), so it has to be repeated
/// here too or raw SQL calling `ST_X`/`ST_MakePoint`/etc unqualified
/// (see `apps/api/src/app/reports/handlers.rs`) fails to resolve them.
pub fn database_url() -> String {
    let base = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let sep = if base.contains('?') { '&' } else { '?' };
    format!("{base}{sep}options=-csearch_path%3Dauth,public,extensions")
}
