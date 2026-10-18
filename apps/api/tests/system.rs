use api::app::system::dto::AppPlatform;
use api::app::system::service::confirm_version_live;
use api_testkit::{fresh_app, shared_test_env, with_search_path, INTERNAL_VERSION_POLICY_SECRET};
use axum::http::StatusCode;
use sea_orm::Database;
use serde_json::json;

async fn get_status(
    app: &api_testkit::TestApp,
    platform: &str,
    version: &str,
) -> (StatusCode, serde_json::Value) {
    app.request_raw(
        "GET",
        "/status",
        &[("x-app-platform", platform), ("x-app-version", version)],
        Vec::new(),
    )
    .await
}

// ---------------------------------------------------------------------------
// get_status (GET /status)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn status_is_up_to_date_with_no_policy_configured() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, body) = get_status(&app, "ios", "1.0.0").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["isMaintenance"], false);
    assert_eq!(body["version"]["status"], "up_to_date");
    assert_eq!(body["version"]["minVersion"], serde_json::Value::Null);
}

#[tokio::test]
#[serial_test::serial]
async fn status_without_app_headers_is_a_neutral_up_to_date() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, body) = app.request("GET", "/status", None, None).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["version"]["status"], "up_to_date");
}

#[tokio::test]
#[serial_test::serial]
async fn status_reflects_a_live_version_policy() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, body) = app
        .request(
            "POST",
            "/internal/version-policy",
            Some(INTERNAL_VERSION_POLICY_SECRET),
            Some(json!({ "platform": "ios", "version": "2.0.0", "isBreaking": true })),
        )
        .await;
    // Not live yet (`update_version_policy` only records it as pending) -
    // `confirm_version_live` below is what the app-store-connect webhook
    // calls once Apple actually confirms it.
    assert_eq!(status, StatusCode::OK, "{body}");

    let database = Database::connect(with_search_path(&env.db.database_url()))
        .await
        .expect("failed to connect to confirm the policy live");
    confirm_version_live(&database, AppPlatform::Ios, "2.0.0".to_string())
        .await
        .expect("failed to confirm version live");

    let (status, body) = get_status(&app, "ios", "1.0.0").await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["version"]["status"], "update_required");
    assert_eq!(body["version"]["minVersion"], "2.0.0");
    assert_eq!(body["version"]["latestVersion"], "2.0.0");

    let (_, body) = get_status(&app, "ios", "2.0.0").await;
    assert_eq!(body["version"]["status"], "up_to_date");

    // A different platform's policy must not leak into android's status.
    let (_, body) = get_status(&app, "android", "1.0.0").await;
    assert_eq!(body["version"]["status"], "up_to_date");
}

// ---------------------------------------------------------------------------
// report_version (POST /internal/version-policy)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn reporting_a_version_requires_the_internal_secret() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "POST",
            "/internal/version-policy",
            None,
            Some(json!({ "platform": "ios", "version": "1.0.0", "isBreaking": false })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[serial_test::serial]
async fn reporting_a_version_rejects_the_wrong_secret() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "POST",
            "/internal/version-policy",
            Some("not-the-right-secret"),
            Some(json!({ "platform": "ios", "version": "1.0.0", "isBreaking": false })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[serial_test::serial]
async fn reporting_a_valid_version_succeeds() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "POST",
            "/internal/version-policy",
            Some(INTERNAL_VERSION_POLICY_SECRET),
            Some(json!({ "platform": "ios", "version": "1.5.0", "isBreaking": false })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    // Recorded as pending, not live yet - it must not affect `/status`
    // until a webhook (or, here, a direct `confirm_version_live` call)
    // confirms it.
    let (_, body) = get_status(&app, "ios", "1.0.0").await;
    assert_eq!(body["version"]["status"], "up_to_date");
}

#[tokio::test]
#[serial_test::serial]
async fn reporting_an_invalid_version_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "POST",
            "/internal/version-policy",
            Some(INTERNAL_VERSION_POLICY_SECRET),
            Some(json!({ "platform": "ios", "version": "not-a-version", "isBreaking": false })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

/// Reporting the same `(platform, version)` twice is a no-op (`ON
/// CONFLICT DO NOTHING`) - CD may retry a deploy notification.
#[tokio::test]
#[serial_test::serial]
async fn reporting_the_same_version_twice_is_a_noop() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    for _ in 0..2 {
        let (status, _) = app
            .request(
                "POST",
                "/internal/version-policy",
                Some(INTERNAL_VERSION_POLICY_SECRET),
                Some(json!({ "platform": "ios", "version": "1.5.0", "isBreaking": false })),
            )
            .await;
        assert_eq!(status, StatusCode::OK);
    }
}
