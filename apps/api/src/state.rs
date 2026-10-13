use crate::app::reports::hub::ReportsHub;
use crate::config::ApiConfig;
use crate::libs::app_store_connect::AppStoreConnectClient;
use auth::AppAuthSchema;
use aws_sdk_s3::Client as S3Client;
use axum::extract::FromRef;
use better_auth::BetterAuth;
use sea_orm::DatabaseConnection;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub config: Arc<ApiConfig>,
    pub auth: Arc<BetterAuth<AppAuthSchema>>,
    pub db: DatabaseConnection,
    pub s3: S3Client,
    pub reports_hub: ReportsHub,
    /// General-purpose Redis connection (cheap to clone, auto-reconnects) -
    /// separate from `reports_hub`'s own dedicated pub/sub connection, which
    /// must stay exclusively in subscribe-listening mode. Used for rate
    /// limiting (see `app::reports::rate_limit`) and open to other
    /// general-purpose caching/counting needs later.
    pub redis: redis::aio::ConnectionManager,
    /// Shared across requests so its JWT cache (see
    /// `AppStoreConnectClient::token`) actually gets reused - see
    /// `app::webhooks::app_store_connect`.
    pub app_store_connect: Arc<AppStoreConnectClient>,
}

impl FromRef<AppState> for Arc<BetterAuth<AppAuthSchema>> {
    fn from_ref(state: &AppState) -> Self {
        state.auth.clone()
    }
}

/// Builds an S3-compatible client for RustFS (see libs/assets, docker-compose.yaml).
/// Path-style addressing is required - RustFS doesn't do virtual-hosted-style
/// (bucket.endpoint.tld) DNS resolution.
pub async fn build_s3_client(config: &ApiConfig) -> S3Client {
    let credentials = aws_sdk_s3::config::Credentials::new(
        &config.s3_access_key_id,
        &config.s3_secret_access_key,
        None,
        None,
        "static",
    );

    let s3_config = aws_sdk_s3::config::Builder::new()
        .behavior_version(aws_sdk_s3::config::BehaviorVersion::latest())
        .region(aws_sdk_s3::config::Region::new(config.s3_region.clone()))
        .endpoint_url(&config.s3_endpoint)
        .credentials_provider(credentials)
        .force_path_style(true)
        .build();

    S3Client::from_conf(s3_config)
}
