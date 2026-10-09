use auth::{create_auth_tables, database_url};
use better_auth::seaorm::Database;

/// One-off migration step: creates better-auth-rs's tables in the `auth`
/// Postgres schema. Meant to run once per deploy, same as the Drizzle
/// migrate+seed step - not on every API server startup. See apps/api's
/// Dockerfile comment and libs/db/Dockerfile for how this is wired in.
#[tokio::main]
async fn main() {
    let database = Database::connect(database_url())
        .await
        .expect("failed to connect to database");

    create_auth_tables(&database).await.expect("failed to create auth tables");

    println!("auth tables created in the `auth` schema");
}
