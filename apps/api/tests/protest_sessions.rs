use api_testkit::{fresh_app, shared_test_env};
use axum::http::StatusCode;
use chrono::Utc;
use serde_json::json;
use uuid::Uuid;

fn multipart_upload_body(boundary: &str, kind: &str, bytes: &[u8]) -> Vec<u8> {
    let mut body = Vec::new();
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"kind\"\r\n\r\n");
    body.extend_from_slice(kind.as_bytes());
    body.extend_from_slice(format!("\r\n--{boundary}\r\n").as_bytes());
    body.extend_from_slice(
        b"Content-Disposition: form-data; name=\"file\"; filename=\"blob\"\r\n\r\n",
    );
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

// ---------------------------------------------------------------------------
// PUT /me/protest-sessions/:id (create_or_get_session)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn creating_a_session_returns_its_started_at() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    let (status, body) = app
        .request(
            "PUT",
            &format!("/me/protest-sessions/{id}"),
            Some(&token),
            Some(json!({ "startedAt": started_at })),
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["id"], id);
    assert!(body["endedAt"].is_null());
}

#[tokio::test]
#[serial_test::serial]
async fn creating_the_same_session_twice_is_a_no_op() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let id = Uuid::new_v4().to_string();
    let started_at = Utc::now().to_rfc3339();
    let path = format!("/me/protest-sessions/{id}");
    let (first_status, first) = app
        .request(
            "PUT",
            &path,
            Some(&token),
            Some(json!({ "startedAt": started_at.clone() })),
        )
        .await;
    assert_eq!(first_status, StatusCode::OK);

    // A different startedAt the second time - ignored, since the row
    // already exists and this is a no-op.
    let (second_status, second) = app
        .request(
            "PUT",
            &path,
            Some(&token),
            Some(json!({ "startedAt": Utc::now().to_rfc3339() })),
        )
        .await;
    assert_eq!(second_status, StatusCode::OK);
    assert_eq!(second["startedAt"], first["startedAt"]);
}

#[tokio::test]
#[serial_test::serial]
async fn creating_a_session_with_someone_elses_id_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let owner_token = app.sign_in("owner@example.com").await;
    let stranger_token = app.sign_in("stranger@example.com").await;

    let id = Uuid::new_v4().to_string();
    let path = format!("/me/protest-sessions/{id}");
    let (owner_status, _) = app
        .request(
            "PUT",
            &path,
            Some(&owner_token),
            Some(json!({ "startedAt": Utc::now().to_rfc3339() })),
        )
        .await;
    assert_eq!(owner_status, StatusCode::OK);

    let (stranger_status, _) = app
        .request(
            "PUT",
            &path,
            Some(&stranger_token),
            Some(json!({ "startedAt": Utc::now().to_rfc3339() })),
        )
        .await;
    assert_eq!(stranger_status, StatusCode::NOT_FOUND);
}

#[tokio::test]
#[serial_test::serial]
async fn create_session_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let id = Uuid::new_v4().to_string();
    let (status, _) = app
        .request(
            "PUT",
            &format!("/me/protest-sessions/{id}"),
            None,
            Some(json!({ "startedAt": Utc::now().to_rfc3339() })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// PATCH /me/protest-sessions/:id (end_session)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn ending_a_session_sets_ended_at() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let id = Uuid::new_v4().to_string();
    let path = format!("/me/protest-sessions/{id}");
    app.request(
        "PUT",
        &path,
        Some(&token),
        Some(json!({ "startedAt": Utc::now().to_rfc3339() })),
    )
    .await;

    let (status, body) = app
        .request(
            "PATCH",
            &path,
            Some(&token),
            Some(json!({ "endedAt": Utc::now().to_rfc3339() })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert!(!body["endedAt"].is_null());
}

#[tokio::test]
#[serial_test::serial]
async fn ending_a_nonexistent_session_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let id = Uuid::new_v4().to_string();
    let (status, _) = app
        .request(
            "PATCH",
            &format!("/me/protest-sessions/{id}"),
            Some(&token),
            Some(json!({ "endedAt": Utc::now().to_rfc3339() })),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
#[serial_test::serial]
async fn ending_someone_elses_session_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let owner_token = app.sign_in("owner@example.com").await;
    let stranger_token = app.sign_in("stranger@example.com").await;

    let id = Uuid::new_v4().to_string();
    let path = format!("/me/protest-sessions/{id}");
    app.request(
        "PUT",
        &path,
        Some(&owner_token),
        Some(json!({ "startedAt": Utc::now().to_rfc3339() })),
    )
    .await;

    let (status, _) = app
        .request(
            "PATCH",
            &path,
            Some(&stranger_token),
            Some(json!({ "endedAt": Utc::now().to_rfc3339() })),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// POST /me/protest-sessions/:id/uploads
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn uploading_a_position_batch_records_it() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let id = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/me/protest-sessions/{id}"),
        Some(&token),
        Some(json!({ "startedAt": Utc::now().to_rfc3339() })),
    )
    .await;

    let boundary = "x-test-boundary";
    let body = multipart_upload_body(boundary, "position_batch", b"encrypted-opaque-blob");
    let (status, response) = app
        .request_multipart(
            "POST",
            &format!("/me/protest-sessions/{id}/uploads"),
            &token,
            boundary,
            body,
        )
        .await;

    assert_eq!(status, StatusCode::OK, "{response}");
    assert_eq!(response["kind"], "position_batch");
}

#[tokio::test]
#[serial_test::serial]
async fn uploading_to_someone_elses_session_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let owner_token = app.sign_in("owner@example.com").await;
    let stranger_token = app.sign_in("stranger@example.com").await;

    let id = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/me/protest-sessions/{id}"),
        Some(&owner_token),
        Some(json!({ "startedAt": Utc::now().to_rfc3339() })),
    )
    .await;

    let boundary = "x-test-boundary";
    let body = multipart_upload_body(boundary, "audio_chunk", b"encrypted-opaque-blob");
    let (status, _) = app
        .request_multipart(
            "POST",
            &format!("/me/protest-sessions/{id}/uploads"),
            &stranger_token,
            boundary,
            body,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
#[serial_test::serial]
async fn uploading_with_an_invalid_kind_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let id = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/me/protest-sessions/{id}"),
        Some(&token),
        Some(json!({ "startedAt": Utc::now().to_rfc3339() })),
    )
    .await;

    let boundary = "x-test-boundary";
    let body = multipart_upload_body(boundary, "not-a-real-kind", b"encrypted-opaque-blob");
    let (status, _) = app
        .request_multipart(
            "POST",
            &format!("/me/protest-sessions/{id}/uploads"),
            &token,
            boundary,
            body,
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
