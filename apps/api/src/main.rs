mod health;

use auth::{AppAuthSchema, create_auth_tables, database_url};
use axum::Router;
use better_auth::integrations::axum::AxumIntegration;
use better_auth::plugins::{EmailPasswordPlugin, SessionManagementPlugin};
use better_auth::seaorm::{Database, SeaOrmStore};
use better_auth::{AuthConfig, BetterAuth};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[derive(OpenApi)]
#[openapi(paths(health::health_check), components(schemas(health::HealthResponse)))]
struct ApiDoc;

fn emit_openapi_and_exit(path: &str) {
    let json = ApiDoc::openapi().to_pretty_json().expect("failed to serialize OpenAPI doc");
    let dir = std::path::Path::new(path).parent().expect("output path has no parent dir");
    std::fs::create_dir_all(dir).expect("failed to create output dir");
    std::fs::write(path, json).expect("failed to write OpenAPI doc");
    println!("Generated OpenAPI JSON at {path}");
    std::process::exit(0);
}

async fn setup_db_and_exit() {
    let database = Database::connect(database_url())
        .await
        .expect("failed to connect to database");
    create_auth_tables(&database).await.expect("failed to create auth tables");
    println!("auth tables created in the `auth` schema");
    std::process::exit(0);
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(idx) = args.iter().position(|a| a == "--emit-openapi") {
        let path = args.get(idx + 1).expect("--emit-openapi requires a path argument");
        emit_openapi_and_exit(path);
    }
    if args.iter().any(|a| a == "--setup-db") {
        setup_db_and_exit().await;
    }

    tracing_subscriber::fmt::init();

    let database = Database::connect(database_url())
        .await
        .expect("failed to connect to database");

    let auth_secret = std::env::var("AUTH_SECRET").unwrap_or_else(|_| {
        tracing::warn!("AUTH_SECRET not set, falling back to an insecure dev-only default");
        "dev-only-secret-change-me-32-characters-minimum".to_string()
    });
    let base_url = std::env::var("API_URL").unwrap_or_else(|_| "http://localhost:3002".to_string());

    let config = AuthConfig::new(auth_secret).base_url(base_url);
    let store = SeaOrmStore::<AppAuthSchema>::new(config.clone(), database);
    let auth = Arc::new(
        BetterAuth::<AppAuthSchema>::new(config)
            .store(store)
            .plugin(EmailPasswordPlugin::new().enable_signup(true).username(true))
            .plugin(SessionManagementPlugin::new())
            .build()
            .await
            .expect("failed to build auth"),
    );

    let app = Router::new()
        .merge(SwaggerUi::new("/docs").url("/openapi.json", ApiDoc::openapi()))
        .route("/health", axum::routing::get(health::health_check))
        .nest("/auth", auth.clone().axum_router())
        .with_state(auth)
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3002")
        .await
        .expect("failed to bind to port 3002");

    tracing::info!("api listening on {}", listener.local_addr().unwrap());

    axum::serve(listener, app).await.expect("server crashed");
}
