use api_testkit::{fresh_app, shared_test_env};
use axum::http::StatusCode;

// ---------------------------------------------------------------------------
// set_avatar (POST /me/avatar)
// ---------------------------------------------------------------------------

fn multipart_body(boundary: &str, content_type: &str, bytes: &[u8]) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        b"Content-Disposition: form-data; name=\"file\"; filename=\"avatar\"\r\n",
    );
    body.extend_from_slice(format!("Content-Type: {content_type}\r\n\r\n").as_bytes());
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

#[tokio::test]
#[serial_test::serial]
async fn uploading_an_avatar_sets_a_resolvable_image_url() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let boundary = "x-test-boundary";
    let body = multipart_body(boundary, "image/png", b"not-a-real-png-but-good-enough");

    let (status, me) = app
        .request_multipart("POST", "/me/avatar", &token, boundary, body)
        .await;
    assert_eq!(status, StatusCode::OK, "{me}");

    let image = me["image"].as_str().expect("image should be a string url");
    assert!(image.ends_with(".png"), "expected a .png url, got {image}");
    assert!(
        image.contains("/public/avatars/"),
        "expected the url to point at the public avatars folder, got {image}"
    );

    let (_, refetched) = app.request("GET", "/me", Some(&token), None).await;
    assert_eq!(refetched["image"], me["image"]);
}

#[tokio::test]
#[serial_test::serial]
async fn uploading_an_unsupported_file_type_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let boundary = "x-test-boundary";
    let body = multipart_body(boundary, "application/pdf", b"not-an-image");

    let (status, _) = app
        .request_multipart("POST", "/me/avatar", &token, boundary, body)
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
#[serial_test::serial]
async fn set_avatar_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app.request("POST", "/me/avatar", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// delete_avatar (DELETE /me/avatar)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn deleting_an_avatar_clears_the_image_url() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let boundary = "x-test-boundary";
    let body = multipart_body(boundary, "image/jpeg", b"not-a-real-jpeg-but-good-enough");
    app.request_multipart("POST", "/me/avatar", &token, boundary, body)
        .await;

    let (status, updated) = app
        .request("DELETE", "/me/avatar", Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["image"], serde_json::Value::Null);

    let (_, me) = app.request("GET", "/me", Some(&token), None).await;
    assert_eq!(me["image"], serde_json::Value::Null);
}

/// Deleting with no avatar set is a no-op, not an error - `delete_avatar`
/// skips the S3 call entirely when `session.user.image` is already `None`.
#[tokio::test]
#[serial_test::serial]
async fn deleting_with_no_avatar_set_is_a_noop() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (status, updated) = app
        .request("DELETE", "/me/avatar", Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["image"], serde_json::Value::Null);
}

#[tokio::test]
#[serial_test::serial]
async fn delete_avatar_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app.request("DELETE", "/me/avatar", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
