mod app;
mod config;
mod libs;
mod state;

use app::{auth_otp, health, internal, me, reports, system, webhooks};
use auth::{database_url, AppAuthSchema, OtpPlugin};
use axum::Router;
use better_auth::config::BearerConfig;
use better_auth::integrations::axum::AxumIntegration;
use better_auth::plugins::SessionManagementPlugin;
use better_auth::seaorm::{Database, SeaOrmStore};
use better_auth::{AuthConfig, BetterAuth};
use bullmq_rs::{QueueBuilder, RedisConnection};
use config::ApiConfig;
use env_rs::RedisConfig;
use libs::otp_sender;
use notify_contracts::NOTIFY_QUEUE;
use state::{build_s3_client, AppState};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

/// The full API's OpenAPI doc, assembled from each top-level module's own
/// slice (each of which may itself be assembled from its own
/// sub-modules' - see `me::openapi`) - this function is the *only* place
/// that needs to change when a whole new top-level module is added; a new
/// path/schema inside an existing one never touches this file at all.
fn build_openapi() -> utoipa::openapi::OpenApi {
    health::ApiDoc::openapi()
        .merge_from(system::ApiDoc::openapi())
        .merge_from(auth_otp::ApiDoc::openapi())
        .merge_from(me::openapi())
        .merge_from(reports::ApiDoc::openapi())
}

fn emit_openapi_and_exit(path: &str) {
    let json = build_openapi()
        .to_pretty_json()
        .expect("failed to serialize OpenAPI doc");
    let dir = std::path::Path::new(path)
        .parent()
        .expect("output path has no parent dir");
    std::fs::create_dir_all(dir).expect("failed to create output dir");
    std::fs::write(path, json).expect("failed to write OpenAPI doc");
    println!("Generated OpenAPI JSON at {path}");
    std::process::exit(0);
}

#[tokio::main]
async fn main() {
    // Repo root's .env (DATABASE_URL, REDIS_*, shared across apps) then
    // this crate's own apps/api/.env on top (APP_STORE_CONNECT_*, specific
    // to this app) - unlike Bun, cargo/rustc never load either on their
    // own, so every env var below would otherwise depend on the shell that
    // launched this process having sourced it manually. See env_rs::load_dotenv.
    env_rs::load_dotenv(env!("CARGO_MANIFEST_DIR"));

    let args: Vec<String> = std::env::args().collect();
    if let Some(idx) = args.iter().position(|a| a == "--emit-openapi") {
        let path = args
            .get(idx + 1)
            .expect("--emit-openapi requires a path argument");
        emit_openapi_and_exit(path);
    }
    tracing_subscriber::fmt::init();

    let api_config: ApiConfig = env_rs::load();
    let redis_config: RedisConfig = env_rs::load();

    let database = Database::connect(database_url())
        .await
        .expect("failed to connect to database");

    let auth_secret = api_config.auth_secret.clone().unwrap_or_else(|| {
        tracing::warn!("AUTH_SECRET not set, falling back to an insecure dev-only default");
        "dev-only-secret-change-me-32-characters-minimum".to_string()
    });

    let mut config = AuthConfig::new(auth_secret).base_url(api_config.api_url.clone());
    // The mobile app has no browser cookie jar - it authenticates with
    // `Authorization: Bearer <token>` using the raw token returned by
    // `/auth/otp/verify`, so every session-checking route (this plugin's
    // and `/me`'s `CurrentSession`/`OptionalSession` extractors alike) must
    // accept it too.
    config.session.bearer = Some(BearerConfig::default());
    let store = SeaOrmStore::<AppAuthSchema>::new(config.clone(), database.clone());
    let otp_sender = Arc::new(otp_sender::BullmqOtpSender::connect(&redis_config.url()).await);
    let auth = Arc::new(
        BetterAuth::<AppAuthSchema>::new(config)
            .store(store)
            .plugin(OtpPlugin::new(otp_sender))
            .plugin(SessionManagementPlugin::new())
            .build()
            .await
            .expect("failed to build auth"),
    );

    let redis_client =
        redis::Client::open(redis_config.url()).expect("failed to parse redis url for AppState");
    let redis = redis::aio::ConnectionManager::new(redis_client)
        .await
        .expect("failed to connect to redis for AppState");

    let s3 = build_s3_client(&api_config).await;
    let app_store_connect = Arc::new(libs::app_store_connect::AppStoreConnectClient::new(
        &api_config,
    ));
    let reports_hub = app::reports::hub::ReportsHub::spawn(redis_config.url());
    let user_events_hub = me::events::hub::UserEventsHub::spawn(redis_config.url());

    let notify_queue = Arc::new(
        QueueBuilder::new(NOTIFY_QUEUE)
            .connection(RedisConnection::new(redis_config.url()))
            .build::<serde_json::Value>()
            .await
            .expect("failed to build notify queue producer"),
    );

    let state = AppState {
        config: Arc::new(api_config),
        auth: auth.clone(),
        db: database,
        s3,
        reports_hub,
        user_events_hub,
        notify_queue,
        redis,
        app_store_connect,
    };

    let app = Router::new()
        .merge(SwaggerUi::new("/docs").url("/openapi.json", build_openapi()))
        .route("/health", axum::routing::get(health::health_check))
        .route("/status", axum::routing::get(system::handlers::get_status))
        .nest("/auth", auth.axum_router_with_state::<AppState>())
        .nest("/me", me::router())
        .nest("/reports", reports::router())
        .nest(
            "/internal/version-policy",
            internal::version_policy::router(),
        )
        .nest(
            "/webhooks/app-store-connect",
            webhooks::app_store_connect::router(),
        )
        .with_state(state)
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3002")
        .await
        .expect("failed to bind to port 3002");

    tracing::info!("api listening on {}", listener.local_addr().unwrap());

    axum::serve(listener, app).await.expect("server crashed");
}
