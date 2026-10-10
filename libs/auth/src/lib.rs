pub mod otp;
pub mod schema;

pub use otp::{OtpEmailSender, OtpPlugin, OtpPurpose};
pub use schema::{create_auth_tables, AppAuthSchema};

/// `DATABASE_URL` points at the shared Postgres database (schema-first,
/// Drizzle-owned for everything except auth). The `auth` schema itself is
/// owned by this service, not Drizzle - pin the session's search_path to it
/// first so unqualified table names in the generated auth schema land
/// there, with `public` right after so apps/api's own unqualified entities
/// (e.g. `user`, `push_token`) still resolve on the same connection. No
/// table name collides between the two schemas, so the order only matters
/// as a tie-breaker that never actually triggers.
pub fn database_url() -> String {
    let base = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let sep = if base.contains('?') { '&' } else { '?' };
    format!("{base}{sep}options=-csearch_path%3Dauth,public")
}
