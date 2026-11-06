use api_testkit::{fresh_app, shared_test_env};
use axum::http::StatusCode;
use serde_json::json;
use uuid::Uuid;

/// The three fields `upload_blob` requires, ciphertext as raw bytes.
fn blob_body(boundary: &str, kind: &str, seq: i32, bytes: &[u8]) -> Vec<u8> {
    let mut body = Vec::new();
    for (name, value) in [("kind", kind.to_string()), ("seq", seq.to_string())] {
        body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
        body.extend_from_slice(
            format!("Content-Disposition: form-data; name=\"{name}\"\r\n\r\n").as_bytes(),
        );
        body.extend_from_slice(value.as_bytes());
        body.extend_from_slice(b"\r\n");
    }
    body.extend_from_slice(format!("--{boundary}\r\n").as_bytes());
    body.extend_from_slice(b"Content-Disposition: form-data; name=\"file\"; filename=\"blob\"\r\n");
    body.extend_from_slice(b"Content-Type: application/octet-stream\r\n\r\n");
    body.extend_from_slice(bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    body
}

fn upsert_payload() -> serde_json::Value {
    json!({ "sealedKey": "sealed-session-key", "metadata": "encrypted-envelope" })
}

// ---------------------------------------------------------------------------
// upsert_session (PUT /protest-session/{id})
// ---------------------------------------------------------------------------

/// The id is minted on the device, so a replayed push has to land on the same
/// row rather than creating a second session.
#[tokio::test]
#[serial_test::serial]
async fn creating_a_session_twice_with_one_id_is_idempotent() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;
    let id = Uuid::new_v4().to_string();
    let path = format!("/protest-session/{id}");

    let (status, first) = app
        .request("PUT", &path, Some(&token), Some(upsert_payload()))
        .await;
    assert_eq!(status, StatusCode::OK, "{first}");
    assert_eq!(first["id"], id);
    assert_eq!(first["active"], true);

    let (status, second) = app
        .request("PUT", &path, Some(&token), Some(upsert_payload()))
        .await;
    assert_eq!(status, StatusCode::OK, "{second}");
    assert_eq!(second["id"], id);

    let (_, list) = app
        .request(
            "GET",
            &format!("/user/{}/protest-sessions", app.user_id(&token).await),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(
        list.as_array().map(|rows| rows.len()),
        Some(1),
        "a replayed push must not create a second session: {list}"
    );
}

/// What makes a DEK rotation survivable: an upsert has to *replace* the sealed
/// key. Keeping the old value would leave the server holding envelopes nobody
/// can open - the whole history gone, with no error anywhere.
#[tokio::test]
#[serial_test::serial]
async fn upserting_an_existing_session_replaces_its_sealed_key() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let id = Uuid::new_v4().to_string();
    let path = format!("/protest-session/{id}");
    let (status, created) = app
        .request("PUT", &path, Some(&token), Some(upsert_payload()))
        .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    assert_eq!(created["sealedKey"], "sealed-session-key");

    let (status, resealed) = app
        .request(
            "PUT",
            &path,
            Some(&token),
            Some(json!({
                "sealedKey": "resealed-under-the-new-dek",
                "metadata": "re-sealed-envelope",
            })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{resealed}");
    assert_eq!(resealed["sealedKey"], "resealed-under-the-new-dek");
    assert_eq!(resealed["metadata"], "re-sealed-envelope");

    // And it is what a later read returns, not just what the write echoed.
    let (_, list) = app
        .request(
            "GET",
            &format!("/user/{}/protest-sessions", app.user_id(&token).await),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(list[0]["sealedKey"], "resealed-under-the-new-dek");
    assert_eq!(
        list.as_array().map(|rows| rows.len()),
        Some(1),
        "replacing a sealed key must not create a second session: {list}"
    );
}

/// Enforced by the partial unique index, not a handler-side check, so two
/// devices starting at the same instant can't race past it.
#[tokio::test]
#[serial_test::serial]
async fn a_second_active_session_is_refused() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let first = Uuid::new_v4().to_string();
    let (status, body) = app
        .request(
            "PUT",
            &format!("/protest-session/{first}"),
            Some(&token),
            Some(upsert_payload()),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let second = Uuid::new_v4().to_string();
    let (status, _) = app
        .request(
            "PUT",
            &format!("/protest-session/{second}"),
            Some(&token),
            Some(upsert_payload()),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::CONFLICT,
        "a second open session must be refused, not silently created"
    );
}

/// Closing frees the slot - otherwise an account could only ever record once.
#[tokio::test]
#[serial_test::serial]
async fn closing_a_session_allows_starting_another() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let first = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/protest-session/{first}"),
        Some(&token),
        Some(upsert_payload()),
    )
    .await;

    let (status, closed) = app
        .request(
            "PATCH",
            &format!("/protest-session/{first}"),
            Some(&token),
            Some(json!({ "metadata": "envelope-with-end-time" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{closed}");
    assert_eq!(closed["active"], false);
    assert_eq!(closed["metadata"], "envelope-with-end-time");

    let second = Uuid::new_v4().to_string();
    let (status, body) = app
        .request(
            "PUT",
            &format!("/protest-session/{second}"),
            Some(&token),
            Some(upsert_payload()),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
}

/// The sequence the client heals itself with: a push gets 409, it closes
/// what is open, the same push succeeds. Without it, one session whose close
/// never landed wedges the account forever.
#[tokio::test]
#[serial_test::serial]
async fn a_conflicting_session_can_be_closed_and_the_push_retried() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let stale = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/protest-session/{stale}"),
        Some(&token),
        Some(upsert_payload()),
    )
    .await;

    // The new session is refused while the stale one is still open.
    let fresh = Uuid::new_v4().to_string();
    let path = format!("/protest-session/{fresh}");
    let (status, _) = app
        .request("PUT", &path, Some(&token), Some(upsert_payload()))
        .await;
    assert_eq!(status, StatusCode::CONFLICT);

    // The client finds it in the list, closes it...
    let (_, list) = app
        .request(
            "GET",
            &format!("/user/{}/protest-sessions", app.user_id(&token).await),
            Some(&token),
            None,
        )
        .await;
    let open: Vec<&serde_json::Value> = list
        .as_array()
        .expect("a list")
        .iter()
        .filter(|row| row["active"] == true)
        .collect();
    assert_eq!(open.len(), 1, "exactly one session should be open: {list}");
    assert_eq!(open[0]["id"], stale);

    let (status, _) = app
        .request(
            "PATCH",
            &format!("/protest-session/{stale}"),
            Some(&token),
            Some(json!({ "metadata": open[0]["metadata"].as_str().unwrap_or("x") })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    // ...and the retry now lands.
    let (status, body) = app
        .request("PUT", &path, Some(&token), Some(upsert_payload()))
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["active"], true);
}

/// Another account's session must look absent, not forbidden: a 403 would
/// confirm that a session exists under that id.
#[tokio::test]
#[serial_test::serial]
async fn another_accounts_session_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let owner = app.sign_in("owner@example.com").await;
    let stranger = app.sign_in("stranger@example.com").await;

    let id = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/protest-session/{id}"),
        Some(&owner),
        Some(upsert_payload()),
    )
    .await;

    let (status, _) = app
        .request(
            "PATCH",
            &format!("/protest-session/{id}"),
            Some(&stranger),
            Some(json!({ "metadata": "x" })),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, list) = app
        .request(
            "GET",
            &format!("/user/{}/protest-sessions", app.user_id(&stranger).await),
            Some(&stranger),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list.as_array().map(|rows| rows.len()), Some(0), "{list}");
}

#[tokio::test]
#[serial_test::serial]
async fn protest_sessions_require_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request("GET", "/user/someone/protest-sessions", None, None)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// upload_blob / download_blob
// ---------------------------------------------------------------------------

/// The round trip that carries the actual evidence: ciphertext up, same
/// ciphertext back, byte for byte.
#[tokio::test]
#[serial_test::serial]
async fn a_blob_round_trips_unchanged() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let session = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/protest-session/{session}"),
        Some(&token),
        Some(upsert_payload()),
    )
    .await;

    let blob = Uuid::new_v4().to_string();
    let path = format!("/protest-session/{session}/blob/{blob}");
    let ciphertext: &[u8] = &[0x00, 0xff, 0x10, 0x42, 0x00, 0x7f];
    let boundary = "x-test-boundary";

    let (status, body) = app
        .request_multipart(
            "PUT",
            &path,
            &token,
            boundary,
            blob_body(boundary, "position_batch", 0, ciphertext),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["kind"], "position_batch");
    assert_eq!(body["seq"], 0);
    assert_eq!(
        body["size"], 6,
        "size must be the raw byte count, not a hex-doubled one: {body}"
    );

    let (status, bytes) = app.request_bytes("GET", &path, &token).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        bytes, ciphertext,
        "the blob must come back exactly as it went up"
    );
}

/// Same reasoning as the session: the outbox replays, so a second upload of
/// one blob id must not duplicate or error.
#[tokio::test]
#[serial_test::serial]
async fn uploading_a_blob_twice_with_one_id_is_idempotent() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let session = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/protest-session/{session}"),
        Some(&token),
        Some(upsert_payload()),
    )
    .await;

    let blob = Uuid::new_v4().to_string();
    let path = format!("/protest-session/{session}/blob/{blob}");
    let boundary = "x-test-boundary";

    for _ in 0..2 {
        let (status, body) = app
            .request_multipart(
                "PUT",
                &path,
                &token,
                boundary,
                blob_body(boundary, "position_batch", 3, b"payload"),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{body}");
        assert_eq!(body["seq"], 3);
    }

    let (_, session_rows) = app
        .request(
            "GET",
            &format!("/user/{}/protest-sessions", app.user_id(&token).await),
            Some(&token),
            None,
        )
        .await;
    let blobs = session_rows[0]["blobs"].as_array().expect("blobs array");
    assert_eq!(
        blobs.len(),
        1,
        "a replayed upload must not duplicate: {session_rows}"
    );
}

/// `seq` is the only ordering available (there is no cleartext timestamp), so
/// two blobs must not be able to claim the same slot.
#[tokio::test]
#[serial_test::serial]
async fn two_blobs_cannot_share_a_sequence_number() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let session = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/protest-session/{session}"),
        Some(&token),
        Some(upsert_payload()),
    )
    .await;

    let boundary = "x-test-boundary";
    for (blob, expected) in [
        (Uuid::new_v4().to_string(), StatusCode::OK),
        (Uuid::new_v4().to_string(), StatusCode::CONFLICT),
    ] {
        let (status, _) = app
            .request_multipart(
                "PUT",
                &format!("/protest-session/{session}/blob/{blob}"),
                &token,
                boundary,
                blob_body(boundary, "position_batch", 7, b"payload"),
            )
            .await;
        assert_eq!(status, expected);
    }
}

/// Ownership is checked before a single byte is read, so an unauthorized
/// caller never gets as far as putting something in the bucket.
#[tokio::test]
#[serial_test::serial]
async fn another_account_cannot_upload_into_a_session() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let owner = app.sign_in("owner@example.com").await;
    let stranger = app.sign_in("stranger@example.com").await;

    let session = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/protest-session/{session}"),
        Some(&owner),
        Some(upsert_payload()),
    )
    .await;

    let blob = Uuid::new_v4().to_string();
    let boundary = "x-test-boundary";
    let (status, _) = app
        .request_multipart(
            "PUT",
            &format!("/protest-session/{session}/blob/{blob}"),
            &stranger,
            boundary,
            blob_body(boundary, "position_batch", 0, b"payload"),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// no delete route
// ---------------------------------------------------------------------------

/// Recordings are append-only on purpose. A seized unlocked phone still holds
/// an authenticated session, and while it cannot read them, a delete endpoint
/// would let whoever holds the device destroy them - server copies included,
/// which is the exact failure this feature exists to prevent. This test is
/// what keeps that decision from being undone by adding a handler back.
#[tokio::test]
#[serial_test::serial]
async fn a_session_cannot_be_deleted() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let token = app.sign_in("owner@example.com").await;

    let session = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/protest-session/{session}"),
        Some(&token),
        Some(upsert_payload()),
    )
    .await;

    let (status, _) = app
        .request(
            "DELETE",
            &format!("/protest-session/{session}"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(
        status,
        StatusCode::METHOD_NOT_ALLOWED,
        "there must be no way to delete a recording"
    );

    let (_, list) = app
        .request(
            "GET",
            &format!("/user/{}/protest-sessions", app.user_id(&token).await),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(list.as_array().map(|rows| rows.len()), Some(1), "{list}");
}
