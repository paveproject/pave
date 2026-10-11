mod app;
mod libs;
mod state;

use app::{auth_otp, health, me, reports};
use libs::otp_sender;
use auth::{create_auth_tables, database_url, AppAuthSchema, OtpPlugin};
use axum::Router;
use better_auth::config::BearerConfig;
use better_auth::integrations::axum::AxumIntegration;
use better_auth::plugins::SessionManagementPlugin;
use better_auth::seaorm::{Database, SeaOrmStore};
use better_auth::{AuthConfig, BetterAuth};
use state::{build_s3_client, AppState};
use std::sync::Arc;
use tower_http::cors::CorsLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

#[derive(OpenApi)]
#[openapi(
    paths(
        health::health_check,
        auth_otp::send_otp,
        auth_otp::verify_otp,
        auth_otp::send_change_email_otp,
        auth_otp::verify_change_email_otp,
        me::handlers::get_me,
        me::handlers::update_me,
        me::handlers::check_username_available,
        me::avatar::handlers::set_avatar,
        me::avatar::handlers::delete_avatar,
        me::push_token::handlers::set_push_token,
        reports::handlers::create_report,
        reports::handlers::list_reports,
    ),
    components(schemas(
        health::HealthResponse,
        auth_otp::SendOtpRequest,
        auth_otp::SendOtpResponse,
        auth_otp::VerifyOtpRequest,
        auth_otp::VerifyOtpResponse,
        auth_otp::SendChangeEmailOtpRequest,
        auth_otp::VerifyChangeEmailOtpRequest,
        auth_otp::VerifyChangeEmailOtpResponse,
        me::dto::MeResponse,
        me::dto::UpdateMeRequest,
        me::dto::UsernameAvailableResponse,
        me::push_token::dto::SetPushTokenRequest,
        me::push_token::dto::PushProvider,
        me::push_token::dto::DeviceType,
        reports::dto::ReportType,
        reports::dto::CreateReportRequest,
        reports::dto::ReportResponse,
        reports::ws_dto::ClientMessage,
        reports::ws_dto::ServerMessage,
    ))
)]
struct ApiDoc;

fn emit_openapi_and_exit(path: &str) {
    let json = ApiDoc::openapi()
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

fn redis_url() -> String {
    let host = std::env::var("REDIS_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = std::env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    match std::env::var("REDIS_PASSWORD") {
        Ok(password) if !password.is_empty() => format!("redis://:{password}@{host}:{port}"),
        _ => format!("redis://{host}:{port}"),
    }
}

async fn setup_db_and_exit() {
    let database = Database::connect(database_url())
        .await
        .expect("failed to connect to database");
    create_auth_tables(&database)
        .await
        .expect("failed to create auth tables");
    println!("auth tables created in the `auth` schema");
    std::process::exit(0);
}

#[tokio::main]
async fn main() {
    // Searches the working directory and its parents for a `.env` file (the
    // repo root's, in dev) - unlike Bun, cargo/rustc never load one on their
    // own, so every env var below would otherwise depend on the shell that
    // launched this process having sourced it manually.
    dotenvy::dotenv().ok();

    let args: Vec<String> = std::env::args().collect();
    if let Some(idx) = args.iter().position(|a| a == "--emit-openapi") {
        let path = args
            .get(idx + 1)
            .expect("--emit-openapi requires a path argument");
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

    let mut config = AuthConfig::new(auth_secret).base_url(base_url);
    // The mobile app has no browser cookie jar - it authenticates with
    // `Authorization: Bearer <token>` using the raw token returned by
    // `/auth/otp/verify`, so every session-checking route (this plugin's
    // and `/me`'s `CurrentSession`/`OptionalSession` extractors alike) must
    // accept it too.
    config.session.bearer = Some(BearerConfig::default());
    let store = SeaOrmStore::<AppAuthSchema>::new(config.clone(), database.clone());
    let otp_sender = Arc::new(otp_sender::BullmqOtpSender::connect(&redis_url()).await);
    let auth = Arc::new(
        BetterAuth::<AppAuthSchema>::new(config)
            .store(store)
            .plugin(OtpPlugin::new(otp_sender))
            .plugin(SessionManagementPlugin::new())
            .build()
            .await
            .expect("failed to build auth"),
    );

    let s3_bucket = std::env::var("S3_BUCKET_PUBLIC").unwrap_or_else(|_| "public".to_string());
    let s3_public_endpoint = std::env::var("S3_PUBLIC_ENDPOINT")
        .or_else(|_| std::env::var("S3_ENDPOINT"))
        .expect("S3_PUBLIC_ENDPOINT or S3_ENDPOINT must be set");

    let redis_client =
        redis::Client::open(redis_url()).expect("failed to parse redis url for AppState");
    let redis = redis::aio::ConnectionManager::new(redis_client)
        .await
        .expect("failed to connect to redis for AppState");

    let state = AppState {
        auth: auth.clone(),
        db: database,
        s3: build_s3_client().await,
        s3_bucket,
        s3_public_endpoint,
        reports_hub: app::reports::hub::ReportsHub::spawn(redis_url()),
        redis,
    };

    let app = Router::new()
        .merge(SwaggerUi::new("/docs").url("/openapi.json", ApiDoc::openapi()))
        .route("/health", axum::routing::get(health::health_check))
        .nest("/auth", auth.axum_router_with_state::<AppState>())
        .nest("/me", me::router())
        .nest("/reports", reports::router())
        .with_state(state)
        .layer(CorsLayer::permissive());

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3002")
        .await
        .expect("failed to bind to port 3002");

    tracing::info!("api listening on {}", listener.local_addr().unwrap());

    axum::serve(listener, app).await.expect("server crashed");
}
