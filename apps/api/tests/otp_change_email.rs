use api_testkit::{fresh_app, shared_test_env};
use axum::http::StatusCode;
use serde_json::json;

// ---------------------------------------------------------------------------
// send_change_email_otp (POST /auth/otp/change-email/send)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn requesting_a_change_sends_a_code_to_the_new_address() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (status, body) = app
        .request(
            "POST",
            "/auth/otp/change-email/send",
            Some(&token),
            Some(json!({ "newEmail": "new@example.com" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(app.last_otp().is_some());
}

#[tokio::test]
#[serial_test::serial]
async fn requesting_a_change_to_the_same_email_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (status, _) = app
        .request(
            "POST",
            "/auth/otp/change-email/send",
            Some(&token),
            Some(json!({ "newEmail": "owner@example.com" })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
#[serial_test::serial]
async fn requesting_a_change_to_an_email_already_in_use_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    app.sign_in("taken@example.com").await;
    let token = app.sign_in("owner@example.com").await;

    let (status, _) = app
        .request(
            "POST",
            "/auth/otp/change-email/send",
            Some(&token),
            Some(json!({ "newEmail": "taken@example.com" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
}

#[tokio::test]
#[serial_test::serial]
async fn send_change_email_otp_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "POST",
            "/auth/otp/change-email/send",
            None,
            Some(json!({ "newEmail": "new@example.com" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// verify_change_email_otp (POST /auth/otp/change-email/verify)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn verifying_the_code_updates_the_email_in_place() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    app.request(
        "POST",
        "/auth/otp/change-email/send",
        Some(&token),
        Some(json!({ "newEmail": "new@example.com" })),
    )
    .await;
    let otp = app.last_otp().expect("no change-email otp captured");

    let (status, body) = app
        .request(
            "POST",
            "/auth/otp/change-email/verify",
            Some(&token),
            Some(json!({ "newEmail": "new@example.com", "code": otp })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (_, me) = app.request("GET", "/me", Some(&token), None).await;
    assert_eq!(me["email"], "new@example.com");
    assert_eq!(me["emailVerified"], true);

    // The *session* that did the verifying is still valid - no re-login
    // required, same account.
    let (status, _) = app.request("GET", "/me", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
#[serial_test::serial]
async fn verifying_with_the_wrong_code_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    app.request(
        "POST",
        "/auth/otp/change-email/send",
        Some(&token),
        Some(json!({ "newEmail": "new@example.com" })),
    )
    .await;

    let (status, _) = app
        .request(
            "POST",
            "/auth/otp/change-email/verify",
            Some(&token),
            Some(json!({ "newEmail": "new@example.com", "code": "000000" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);

    let (_, me) = app.request("GET", "/me", Some(&token), None).await;
    assert_eq!(me["email"], "owner@example.com");
}

#[tokio::test]
#[serial_test::serial]
async fn verify_change_email_otp_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "POST",
            "/auth/otp/change-email/verify",
            None,
            Some(json!({ "newEmail": "new@example.com", "code": "123456" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
