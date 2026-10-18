use api_testkit::{fresh_app, shared_test_env};
use axum::http::StatusCode;
use db_rs::push_token;
use sea_orm::{ColumnTrait, Database, EntityTrait, QueryFilter};
use serde_json::json;

// ---------------------------------------------------------------------------
// set_push_token (PUT /me/push-token)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn registering_a_push_token_stores_it() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (_, me) = app.request("GET", "/me", Some(&token), None).await;
    let user_id = me["id"].as_str().unwrap().to_string();

    let (status, _) = app
        .request(
            "PUT",
            "/me/push-token",
            Some(&token),
            Some(json!({ "provider": "fcm", "token": "device-token-1", "deviceType": "ios" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let db = Database::connect(env.db.database_url())
        .await
        .expect("failed to connect to inspect push tokens");
    let rows = push_token::Entity::find()
        .filter(push_token::Column::UserId.eq(user_id))
        .all(&db)
        .await
        .expect("failed to query push tokens");
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].token, "device-token-1");
}

/// Re-registering the same `(user_id, token, provider)` updates the
/// existing row (new session/device type) instead of inserting a
/// duplicate - same upsert reasoning as `set_device`.
#[tokio::test]
#[serial_test::serial]
async fn reregistering_the_same_token_updates_in_place() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (_, me) = app.request("GET", "/me", Some(&token), None).await;
    let user_id = me["id"].as_str().unwrap().to_string();

    app.request(
        "PUT",
        "/me/push-token",
        Some(&token),
        Some(json!({ "provider": "fcm", "token": "device-token-1", "deviceType": "ios" })),
    )
    .await;
    let (status, _) = app
        .request(
            "PUT",
            "/me/push-token",
            Some(&token),
            Some(json!({ "provider": "fcm", "token": "device-token-1", "deviceType": "android" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let db = Database::connect(env.db.database_url())
        .await
        .expect("failed to connect to inspect push tokens");
    let rows = push_token::Entity::find()
        .filter(push_token::Column::UserId.eq(user_id))
        .all(&db)
        .await
        .expect("failed to query push tokens");
    assert_eq!(
        rows.len(),
        1,
        "re-registering the same (user, token, provider) must not create a second row"
    );
}

/// The same token under a different provider is a distinct row - the
/// conflict target is `(user_id, token, provider)`, not `(user_id, token)`.
#[tokio::test]
#[serial_test::serial]
async fn same_token_under_a_different_provider_is_a_separate_row() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (_, me) = app.request("GET", "/me", Some(&token), None).await;
    let user_id = me["id"].as_str().unwrap().to_string();

    app.request(
        "PUT",
        "/me/push-token",
        Some(&token),
        Some(json!({ "provider": "fcm", "token": "same-token", "deviceType": "ios" })),
    )
    .await;
    app.request(
        "PUT",
        "/me/push-token",
        Some(&token),
        Some(json!({ "provider": "apns", "token": "same-token", "deviceType": "ios" })),
    )
    .await;

    let db = Database::connect(env.db.database_url())
        .await
        .expect("failed to connect to inspect push tokens");
    let rows = push_token::Entity::find()
        .filter(push_token::Column::UserId.eq(user_id))
        .all(&db)
        .await
        .expect("failed to query push tokens");
    assert_eq!(rows.len(), 2);
}

#[tokio::test]
#[serial_test::serial]
async fn set_push_token_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "PUT",
            "/me/push-token",
            None,
            Some(json!({ "provider": "fcm", "token": "t", "deviceType": "ios" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
