use api_testkit::{fresh_app, shared_test_env};
use axum::http::StatusCode;
use serde_json::json;

// ---------------------------------------------------------------------------
// signup (GenerateUsernameHook) + get_me (GET /me)
// ---------------------------------------------------------------------------

/// Every OTP signup gets a gamertag-style username assigned atomically by
/// `GenerateUsernameHook` - `username` must never be null, regardless of
/// where a caller looks it up from.
#[tokio::test]
#[serial_test::serial]
async fn signing_up_assigns_a_generated_username() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("fresh@example.com").await;
    let (status, me) = app.request("GET", "/me", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{me}");

    let username = me["username"]
        .as_str()
        .expect("username must be a string, never null");
    assert!(!username.is_empty());
    assert!(
        username.chars().all(|c| c.is_ascii_alphanumeric()),
        "generated username should be plain alphanumeric: {username}"
    );
    assert_eq!(me["welcomedAt"], serde_json::Value::Null);
}

/// Two independent signups must not collide on the same generated name.
#[tokio::test]
#[serial_test::serial]
async fn two_signups_get_different_generated_usernames() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token1 = app.sign_in("one@example.com").await;
    let token2 = app.sign_in("two@example.com").await;

    let (_, me1) = app.request("GET", "/me", Some(&token1), None).await;
    let (_, me2) = app.request("GET", "/me", Some(&token2), None).await;

    assert_ne!(me1["username"], me2["username"]);
}

// ---------------------------------------------------------------------------
// update_me (PATCH /me)
// ---------------------------------------------------------------------------

/// Renaming preserves whatever casing the caller typed in the response
/// (`display_username`), even though the canonical `username` column
/// backing uniqueness is lowercase underneath.
#[tokio::test]
#[serial_test::serial]
async fn renaming_preserves_casing() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (status, updated) = app
        .request(
            "PATCH",
            "/me",
            Some(&token),
            Some(json!({ "username": "JohnDoe" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["username"], "JohnDoe");
    assert!(!updated["usernameUpdatedAt"].is_null());

    let (_, me) = app.request("GET", "/me", Some(&token), None).await;
    assert_eq!(me["username"], "JohnDoe");
}

#[tokio::test]
#[serial_test::serial]
async fn marking_welcomed_sets_welcomed_at() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (_, me) = app.request("GET", "/me", Some(&token), None).await;
    assert_eq!(me["welcomedAt"], serde_json::Value::Null);

    let (status, updated) = app
        .request(
            "PATCH",
            "/me",
            Some(&token),
            Some(json!({ "welcomed": true })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert!(!updated["welcomedAt"].is_null());
}

// ---------------------------------------------------------------------------
// check_username_available (GET /me/username-available)
// ---------------------------------------------------------------------------

/// The whole point of the `display_username`/`username` split: a case
/// variant of an already-taken name must be reported taken too, not just
/// an exact byte-for-byte match.
#[tokio::test]
#[serial_test::serial]
async fn availability_check_is_case_insensitive() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    app.request(
        "PATCH",
        "/me",
        Some(&owner_token),
        Some(json!({ "username": "JohnDoe" })),
    )
    .await;

    let other_token = app.sign_in("other@example.com").await;
    for candidate in ["johndoe", "JOHNDOE", "JohnDoe", "jOhNdOe"] {
        let (status, available) = app
            .request(
                "GET",
                &format!("/me/username-available?username={candidate}"),
                Some(&other_token),
                None,
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{available}");
        assert_eq!(
            available["available"], false,
            "{candidate} should be reported taken"
        );
    }

    let (status, available) = app
        .request(
            "GET",
            "/me/username-available?username=SomeoneElseEntirely",
            Some(&other_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{available}");
    assert_eq!(available["available"], true);
}

/// A user checking their own current username (in any casing) must not be
/// told it's taken by themselves.
#[tokio::test]
#[serial_test::serial]
async fn availability_check_excludes_the_caller_themselves() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    app.request(
        "PATCH",
        "/me",
        Some(&token),
        Some(json!({ "username": "JohnDoe" })),
    )
    .await;

    for candidate in ["JohnDoe", "johndoe", "JOHNDOE"] {
        let (status, available) = app
            .request(
                "GET",
                &format!("/me/username-available?username={candidate}"),
                Some(&token),
                None,
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{available}");
        assert_eq!(
            available["available"], true,
            "{candidate} is the caller's own name"
        );
    }
}

#[tokio::test]
#[serial_test::serial]
async fn username_available_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "GET",
            "/me/username-available?username=anything",
            None,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
