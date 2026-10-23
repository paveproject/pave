use api_testkit::{fresh_app, register_device, shared_test_env};
use axum::http::StatusCode;
use serde_json::json;

// ---------------------------------------------------------------------------
// reserve_recovery_dek_generation (POST /me/recovery-dek-generation/reserve)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn reserving_generation_zero_on_a_fresh_account_succeeds() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    register_device(&app, &token, "pk-d1", "ios").await;

    let (status, body) = app
        .request(
            "POST",
            "/me/recovery-dek-generation/reserve",
            Some(&token),
            Some(json!({ "expectedGeneration": 0 })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["generation"], 1);
}

/// The whole point of this endpoint: two devices racing on the same
/// `expectedGeneration` can't both win - whichever lands second gets the
/// real current value back instead of silently succeeding with its own.
#[tokio::test]
#[serial_test::serial]
async fn a_second_reservation_at_the_same_expected_generation_conflicts() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    register_device(&app, &token, "pk-d1", "ios").await;

    let (status, first) = app
        .request(
            "POST",
            "/me/recovery-dek-generation/reserve",
            Some(&token),
            Some(json!({ "expectedGeneration": 0 })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{first}");
    assert_eq!(first["generation"], 1);

    // A second device, racing on the same stale belief ("generation is
    // still 0") - loses, and must be told the real current value.
    let (status, second) = app
        .request(
            "POST",
            "/me/recovery-dek-generation/reserve",
            Some(&token),
            Some(json!({ "expectedGeneration": 0 })),
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT, "{second}");
    assert_eq!(second["currentGeneration"], 1);
}

/// Sequential use (no race) must keep working past the very first
/// reservation - this is the normal, non-racing path every rotation
/// actually takes.
#[tokio::test]
#[serial_test::serial]
async fn reserving_the_next_generation_after_a_successful_one_succeeds() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    register_device(&app, &token, "pk-d1", "ios").await;

    app.request(
        "POST",
        "/me/recovery-dek-generation/reserve",
        Some(&token),
        Some(json!({ "expectedGeneration": 0 })),
    )
    .await;

    let (status, body) = app
        .request(
            "POST",
            "/me/recovery-dek-generation/reserve",
            Some(&token),
            Some(json!({ "expectedGeneration": 1 })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["generation"], 2);
}

/// Each account keeps its own independent counter - structurally
/// guaranteed (every query is scoped to `session.user.id`, no `{id}`
/// path parameter exists to target someone else's), but worth asserting
/// explicitly.
#[tokio::test]
#[serial_test::serial]
async fn each_account_has_its_own_independent_generation() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token_a = app.sign_in("owner-a@example.com").await;
    register_device(&app, &token_a, "pk-a1", "ios").await;
    let token_b = app.sign_in("owner-b@example.com").await;
    register_device(&app, &token_b, "pk-b1", "ios").await;

    app.request(
        "POST",
        "/me/recovery-dek-generation/reserve",
        Some(&token_a),
        Some(json!({ "expectedGeneration": 0 })),
    )
    .await;

    // B's account never reserved anything - still starts fresh at 0,
    // unaffected by A's own reservation.
    let (status, body) = app
        .request(
            "POST",
            "/me/recovery-dek-generation/reserve",
            Some(&token_b),
            Some(json!({ "expectedGeneration": 0 })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["generation"], 1);
}

#[tokio::test]
#[serial_test::serial]
async fn reserving_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "POST",
            "/me/recovery-dek-generation/reserve",
            None,
            Some(json!({ "expectedGeneration": 0 })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
