use crate::app::reports::hub::ReportsHub;
use auth::AppAuthSchema;
use aws_sdk_s3::Client as S3Client;
use axum::extract::FromRef;
use better_auth::BetterAuth;
use sea_orm::DatabaseConnection;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub auth: Arc<BetterAuth<AppAuthSchema>>,
    pub db: DatabaseConnection,
    pub s3: S3Client,
    pub s3_bucket: String,
    pub s3_public_endpoint: String,
    pub reports_hub: ReportsHub,
}

impl FromRef<AppState> for Arc<BetterAuth<AppAuthSchema>> {
    fn from_ref(state: &AppState) -> Self {
        state.auth.clone()
    }
}

/// Builds an S3-compatible client for RustFS (see libs/assets, docker-compose.yaml).
/// Path-style addressing is required - RustFS doesn't do virtual-hosted-style
/// (bucket.endpoint.tld) DNS resolution.
pub async fn build_s3_client() -> S3Client {
    let endpoint = std::env::var("S3_ENDPOINT").expect("S3_ENDPOINT must be set");
    let region = std::env::var("S3_REGION").unwrap_or_else(|_| "eu-west-1".to_string());
    let access_key_id = std::env::var("S3_ACCESS_KEY_ID").expect("S3_ACCESS_KEY_ID must be set");
    let secret_access_key =
        std::env::var("S3_SECRET_ACCESS_KEY").expect("S3_SECRET_ACCESS_KEY must be set");

    let credentials = aws_sdk_s3::config::Credentials::new(
        access_key_id,
        secret_access_key,
        None,
        None,
        "static",
    );

    let config = aws_sdk_s3::config::Builder::new()
        .behavior_version(aws_sdk_s3::config::BehaviorVersion::latest())
        .region(aws_sdk_s3::config::Region::new(region))
        .endpoint_url(endpoint)
        .credentials_provider(credentials)
        .force_path_style(true)
        .build();

    S3Client::from_conf(config)
}
