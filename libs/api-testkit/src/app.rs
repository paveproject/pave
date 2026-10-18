use api::config::ApiConfig;
use api::state::{build_s3_client, AppState};
use api::{app, build_app};
use async_trait::async_trait;
use auth::{AppAuthSchema, OtpEmailSender, OtpPlugin, OtpPurpose};
use axum::body::Body;
use axum::http::{Request, StatusCode};
use axum::Router;
use better_auth::config::BearerConfig;
use better_auth::plugins::SessionManagementPlugin;
use better_auth::seaorm::{Database, SeaOrmStore};
use better_auth::{AuthConfig, AuthResult, BetterAuth};
use bullmq_rs::{QueueBuilder, RedisConnection};
use http_body_util::BodyExt;
use notify_contracts::NOTIFY_QUEUE;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use test_support::{
    start_test_database, start_test_redis, start_test_s3, TestDatabase, TestRedis, TestS3,
};
use tower::ServiceExt;

/// `Authorization: Bearer <this>` for `POST /internal/version-policy` -
/// exported so a test can sign its own requests the same way CD does.
pub const INTERNAL_VERSION_POLICY_SECRET: &str = "test-internal-version-policy-secret";
/// HMAC key for `POST /webhooks/app-store-connect` - exported so a test
/// can compute a valid `x-apple-signature` for its own payload.
pub const APP_STORE_CONNECT_WEBHOOK_SECRET: &str = "test-app-store-connect-webhook-secret";

/// Mirrors `auth::database_url()`'s own `search_path` override - this
/// crate's SeaORM entities are all unqualified, so every test connection
/// needs the exact same `auth,public,extensions,system` ordering the real
/// one gets in `main.rs`, or `auth.user`/`public.device` resolve to the
/// wrong (or no) table, and `version_policy`'s `system.platform`/
/// `system.version_release_state` enum types don't resolve at all. Public
/// (not just used internally by `fresh_app`): any test needing its own raw
/// connection (see `apps/api/tests/system.rs`) must wrap it the same way.
pub fn with_search_path(database_url: &str) -> String {
    let sep = if database_url.contains('?') { '&' } else { '?' };
    format!("{database_url}{sep}options=-csearch_path%3Dauth,public,extensions,system")
}

/// Stands in for `BullmqOtpSender` - captures the generated code instead
/// of enqueueing a real notify job, so a test can sign a fresh user in
/// through the *real* `/auth/otp/send` + `/auth/otp/verify` HTTP flow
/// without needing `notify` running or a real inbox to read.
#[derive(Default)]
pub struct CapturingOtpSender {
    last_otp: Mutex<Option<String>>,
}

#[async_trait]
impl OtpEmailSender for CapturingOtpSender {
    async fn send_otp(
        &self,
        _email: &str,
        otp: &str,
        _lang: &str,
        _purpose: OtpPurpose,
    ) -> AuthResult<()> {
        *self.last_otp.lock().expect("otp mutex poisoned") = Some(otp.to_string());
        Ok(())
    }
}

/// One full, real `api` app (every middleware/route `main.rs` wires up),
/// pointed at a test Postgres + test Redis instead of the real ones - the
/// only test double anywhere in this stack is the OTP email delivery
/// (`otp_sender`), which never needs to actually leave the process.
pub struct TestApp {
    pub router: Router,
    otp_sender: Arc<CapturingOtpSender>,
}

impl TestApp {
    /// Sends a real request through the router, same as a real client
    /// would - no shortcuts into handler internals.
    pub async fn request(
        &self,
        method: &str,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut builder = Request::builder().method(method).uri(path);
        if let Some(token) = token {
            builder = builder.header("authorization", format!("Bearer {token}"));
        }
        let request = if let Some(body) = body {
            builder
                .header("content-type", "application/json")
                .body(Body::from(
                    serde_json::to_vec(&body).expect("serializable body"),
                ))
                .expect("valid request")
        } else {
            builder.body(Body::empty()).expect("valid request")
        };

        self.send(request).await
    }

    /// Same as `request`, but with a raw `multipart/form-data` body (for
    /// `set_avatar`, the only endpoint that takes one) instead of JSON -
    /// callers build the body themselves so this stays a thin wrapper, not
    /// another place that has to know the exact multipart framing.
    pub async fn request_multipart(
        &self,
        method: &str,
        path: &str,
        token: &str,
        boundary: &str,
        body: Vec<u8>,
    ) -> (StatusCode, Value) {
        let request = Request::builder()
            .method(method)
            .uri(path)
            .header("authorization", format!("Bearer {token}"))
            .header(
                "content-type",
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(Body::from(body))
            .expect("valid request");

        self.send(request).await
    }

    /// The most recently captured OTP (sign-in or change-email) - `None`
    /// if nothing has triggered one yet. Exposed for flows `sign_in`
    /// doesn't cover (change-email sends to a different address than the
    /// signed-in user's own, so a test needs to read it out itself).
    pub fn last_otp(&self) -> Option<String> {
        self.otp_sender
            .last_otp
            .lock()
            .expect("otp mutex poisoned")
            .clone()
    }

    /// Lowest-level primitive: a request with whatever exact headers and
    /// raw body a test needs (custom headers like `x-app-platform` or a
    /// signed webhook payload) that `request`/`request_multipart` don't
    /// cover - those two stay the common case, this is the escape hatch.
    pub async fn request_raw(
        &self,
        method: &str,
        path: &str,
        headers: &[(&str, &str)],
        body: Vec<u8>,
    ) -> (StatusCode, Value) {
        let mut builder = Request::builder().method(method).uri(path);
        for (name, value) in headers {
            builder = builder.header(*name, *value);
        }
        let request = builder.body(Body::from(body)).expect("valid request");

        self.send(request).await
    }

    async fn send(&self, request: Request<Body>) -> (StatusCode, Value) {
        let response = self
            .router
            .clone()
            .oneshot(request)
            .await
            .expect("router never returns Err - that's an Infallible service");
        let status = response.status();
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("failed to read response body")
            .to_bytes();
        let body = if bytes.is_empty() {
            Value::Null
        } else {
            serde_json::from_slice(&bytes).unwrap_or(Value::Null)
        };
        (status, body)
    }

    /// Signs a fresh (or returning) user in through the real OTP flow, and
    /// immediately does what the real mobile app always does right after
    /// (`GET /me`) - a sanity check that signup actually went through
    /// (`CreatePaveUserRowHook`/`GenerateUsernameHook` both ran), which
    /// every other `/me/*` endpoint assumes.
    pub async fn sign_in(&self, email: &str) -> String {
        let (status, _) = self
            .request(
                "POST",
                "/auth/otp/send",
                None,
                Some(json!({ "email": email })),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "otp send failed for {email}");

        let otp = self
            .last_otp()
            .unwrap_or_else(|| panic!("no otp captured for {email}"));

        let (status, body) = self
            .request(
                "POST",
                "/auth/otp/verify",
                None,
                Some(json!({ "email": email, "code": otp })),
            )
            .await;
        assert_eq!(
            status,
            StatusCode::OK,
            "otp verify failed for {email}: {body}"
        );

        let token = body["token"]
            .as_str()
            .unwrap_or_else(|| panic!("otp verify response missing token: {body}"))
            .to_string();

        let (status, _) = self.request("GET", "/me", Some(&token), None).await;
        assert_eq!(
            status,
            StatusCode::OK,
            "GET /me failed right after sign-in for {email}"
        );

        token
    }
}

/// Everything a test needs: the shared Postgres/Redis/S3 testcontainers
/// (one per test binary - see `TestDatabase`'s own doc comment) plus a
/// fresh `TestApp` wired to a freshly-reset database.
pub struct TestEnv {
    pub db: TestDatabase,
    pub redis: TestRedis,
    pub s3: TestS3,
}

pub async fn start_test_env() -> TestEnv {
    let db = start_test_database().await;
    let redis = start_test_redis().await;
    let s3 = start_test_s3().await;
    TestEnv { db, redis, s3 }
}

/// Cargo compiles each `tests/*.rs` file into its own process - `#[tokio::test]`
/// functions *within* one of those files still run concurrently by
/// default, though. Calling `start_test_env()` directly from every test
/// would start its own Postgres/Redis pair *per test function*, not per
/// file: with several tests racing to build the same Docker image at
/// once, that's not just wasteful, it can stall for several minutes.
///
/// Call this instead: the first caller in a process does the real work,
/// everyone else just awaits the same result. One container pair per
/// test *file*, shared by every test in it (reset between them via
/// `fresh_app`) - never per test function, never shared *across* files
/// (each of those is a different process with its own `static`).
static SHARED_TEST_ENV: tokio::sync::OnceCell<TestEnv> = tokio::sync::OnceCell::const_new();

pub async fn shared_test_env() -> &'static TestEnv {
    SHARED_TEST_ENV.get_or_init(start_test_env).await
}

/// Resets the shared database and builds a brand new `TestApp` against it.
/// Call this at the top of every `#[tokio::test]` sharing one `TestEnv`,
/// same as `TestDatabase::reset()`'s own doc comment recommends.
pub async fn fresh_app(env: &TestEnv) -> TestApp {
    let database_url = with_search_path(&env.db.database_url());
    let redis_url = env.redis.url();
    env.db.reset().await;

    let api_config = ApiConfig {
        auth_secret: Some("test-only-secret-at-least-32-characters-long".to_string()),
        api_url: "http://localhost:3002".to_string(),
        s3_bucket_public: test_support::PUBLIC_BUCKET.to_string(),
        s3_bucket_private: test_support::PRIVATE_BUCKET.to_string(),
        s3_public_endpoint: None,
        s3_endpoint: env.s3.endpoint_url(),
        s3_region: "eu-west-1".to_string(),
        s3_access_key_id: env.s3.access_key_id().to_string(),
        s3_secret_access_key: env.s3.secret_access_key().to_string(),
        api_internal_version_policy_secret: Some(INTERNAL_VERSION_POLICY_SECRET.to_string()),
        app_store_connect_webhook_secret: Some(APP_STORE_CONNECT_WEBHOOK_SECRET.to_string()),
        app_store_connect_key_id: None,
        app_store_connect_issuer_id: None,
        app_store_connect_private_key: None,
        app_store_connect_app_id: None,
        geoip_db_path: None,
    };

    let database = Database::connect(database_url)
        .await
        .expect("failed to connect to test database");

    let mut auth_config = AuthConfig::new(api_config.auth_secret.clone().unwrap())
        .base_url(api_config.api_url.clone());
    auth_config.session.bearer = Some(BearerConfig::default());
    let store = SeaOrmStore::<AppAuthSchema>::new(auth_config.clone(), database.clone())
        .hook(api::libs::auth_hooks::GenerateUsernameHook)
        .hook(api::libs::auth_hooks::CreatePaveUserRowHook);
    let otp_sender = Arc::new(CapturingOtpSender::default());
    let auth = Arc::new(
        BetterAuth::<AppAuthSchema>::new(auth_config)
            .store(store)
            .plugin(OtpPlugin::new(otp_sender.clone()))
            .plugin(SessionManagementPlugin::new())
            .build()
            .await
            .expect("failed to build test auth"),
    );

    let redis_client =
        redis::Client::open(redis_url.clone()).expect("failed to parse test redis url");
    let redis_conn = redis::aio::ConnectionManager::new(redis_client)
        .await
        .expect("failed to connect to test redis for AppState");

    let s3 = build_s3_client(&api_config).await;
    let app_store_connect = Arc::new(api::libs::app_store_connect::AppStoreConnectClient::new(
        &api_config,
    ));
    let reports_hub = app::reports::hub::ReportsHub::spawn(redis_url.clone());
    let user_events_hub = app::me::events::hub::UserEventsHub::spawn(redis_url.clone());

    let notify_queue = Arc::new(
        QueueBuilder::new(NOTIFY_QUEUE)
            .connection(RedisConnection::new(redis_url))
            .build::<serde_json::Value>()
            .await
            .expect("failed to build test notify queue producer"),
    );

    let state = AppState {
        config: Arc::new(api_config),
        auth,
        db: database,
        s3,
        reports_hub,
        user_events_hub,
        notify_queue,
        redis: redis_conn,
        app_store_connect,
        geoip: None,
    };

    TestApp {
        router: build_app(state),
        otp_sender,
    }
}
