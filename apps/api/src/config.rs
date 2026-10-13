use serde::Deserialize;

/// Everything `api` reads from the environment, loaded once in `main` and
/// carried in `AppState` from there - no `std::env::var` anywhere else in
/// this crate. Redis is shared with `apps/notify` (see
/// `env_rs::RedisConfig`), loaded separately since it's not part of
/// this struct's own shape. `DATABASE_URL` stays with `auth::database_url()`
/// (it needs a connection-string `options` override libs/auth already
/// owns) - don't duplicate it here.
#[derive(Debug, Clone, Deserialize)]
pub struct ApiConfig {
    /// `None` in dev is fine (falls back to an insecure default, logged
    /// loudly at boot in `main`) - never silently default in prod.
    pub auth_secret: Option<String>,
    #[serde(default = "default_api_url")]
    pub api_url: String,

    #[serde(default = "default_s3_bucket_public")]
    pub s3_bucket_public: String,
    pub s3_public_endpoint: Option<String>,
    pub s3_endpoint: String,
    #[serde(default = "default_s3_region")]
    pub s3_region: String,
    pub s3_access_key_id: String,
    pub s3_secret_access_key: String,

    /// Bearer secret CD uses to report a shipped mobile version (see
    /// `app::internal::version_policy::guard`). `None` means every call
    /// is rejected - not configured yet is a safe default, not an error.
    pub api_internal_version_policy_secret: Option<String>,

    /// HMAC secret verifying Apple's webhook signature (see
    /// `app::webhooks::app_store_connect::handlers`). Same "`None` =
    /// reject everything" reasoning.
    pub app_store_connect_webhook_secret: Option<String>,
    /// The four below back `libs::app_store_connect::AppStoreConnectClient` -
    /// all `None` until a real App Store Connect API key is provisioned, at
    /// which point that client starts resolving webhook events instead of
    /// silently no-op'ing. See that module's doc comment.
    pub app_store_connect_key_id: Option<String>,
    pub app_store_connect_issuer_id: Option<String>,
    pub app_store_connect_private_key: Option<String>,
    pub app_store_connect_app_id: Option<String>,
}

fn default_api_url() -> String {
    "http://localhost:3002".to_string()
}

fn default_s3_bucket_public() -> String {
    "public".to_string()
}

fn default_s3_region() -> String {
    "eu-west-1".to_string()
}

impl ApiConfig {
    /// `S3_PUBLIC_ENDPOINT` falls back to `S3_ENDPOINT` - same host in
    /// dev (one RustFS, no separate public hostname yet).
    pub fn s3_public_endpoint(&self) -> &str {
        self.s3_public_endpoint
            .as_deref()
            .unwrap_or(&self.s3_endpoint)
    }
}
