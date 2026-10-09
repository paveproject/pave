pub mod schema;

pub use schema::{AppAuthSchema, create_auth_tables};

/// `DATABASE_URL` points at the shared Postgres database (schema-first,
/// Drizzle-owned for everything except auth). The `auth` schema itself is
/// owned by this service, not Drizzle - pin the session's search_path to it
/// so unqualified table names in the generated schema land there.
pub fn database_url() -> String {
    let base = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let sep = if base.contains('?') { '&' } else { '?' };
    format!("{base}{sep}options=-csearch_path%3Dauth")
}
