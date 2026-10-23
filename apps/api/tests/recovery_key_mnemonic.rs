use api_testkit::{fresh_app, register_device, setup_recovery_scenario, shared_test_env};
use axum::http::StatusCode;
use serde_json::json;

/// Scans the real queue in the real Redis (not an assumption about what a
/// handler *should* have sent) for a job whose name matches and whose
/// serialized data contains `data_substring` - same approach
/// `full_recovery_flow_from_creation_to_shares` in `recovery_requests.rs`
/// already uses for exactly this kind of assertion.
async fn job_was_enqueued(redis_url: &str, name: &str, data_substring: &str) -> bool {
    let redis_client = redis::Client::open(redis_url).expect("invalid redis url for assertion");
    let mut redis_conn = redis_client
        .get_multiplexed_async_connection()
        .await
        .expect("failed to connect to redis for assertion");
    let job_keys: Vec<String> = redis::cmd("KEYS")
        .arg("bull:notify_queue:*")
        .query_async(&mut redis_conn)
        .await
        .expect("KEYS failed");

    for key in &job_keys {
        let job_name: Option<String> = redis::cmd("HGET")
            .arg(key)
            .arg("name")
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(None);
        let data: Option<String> = redis::cmd("HGET")
            .arg(key)
            .arg("data")
            .query_async(&mut redis_conn)
            .await
            .unwrap_or(None);
        if job_name.as_deref() == Some(name)
            && data.as_deref().is_some_and(|d| d.contains(data_substring))
        {
            return true;
        }
    }
    false
}

// ---------------------------------------------------------------------------
// set_recovery_key_mnemonic (PUT /me/recovery-key-mnemonic)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn setting_the_mnemonic_blob_is_idempotent_upsert() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;

    let (status, _) = app
        .request(
            "PUT",
            "/me/recovery-key-mnemonic",
            Some(&token),
            Some(json!({ "encryptedDek": "blob-v1" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = app
        .request(
            "PUT",
            "/me/recovery-key-mnemonic",
            Some(&token),
            Some(json!({ "encryptedDek": "blob-v2" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let (status, body) = app
        .request("GET", "/me/recovery-key-mnemonic", Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(
        body["encryptedDek"], "blob-v2",
        "a second PUT replaces the blob in place, not a second row"
    );
}

/// A device with an already-live session (seized, shoulder-surfed) could
/// otherwise silently overwrite the blob with one sealed to a phrase only
/// an attacker knows, planting a backdoor with zero other trace - the
/// write side needs the exact same unconditional safety net as the read
/// side (`fetching_the_blob_always_enqueues_the_security_email`), not just
/// the read side.
#[tokio::test]
#[serial_test::serial]
async fn setting_the_blob_enqueues_the_security_email() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;

    let (status, _) = app
        .request(
            "PUT",
            "/me/recovery-key-mnemonic",
            Some(&token),
            Some(json!({ "encryptedDek": "blob-v1" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        job_was_enqueued(
            &env.redis.url(),
            "recovery-key-mnemonic:set-email",
            "owner@example.com",
        )
        .await,
        "the initial PUT must enqueue the security email"
    );
}

/// Same safety net, exercised on an overwrite rather than the initial
/// setup - the enqueue happens unconditionally after the upsert, not just
/// on the insert branch.
#[tokio::test]
#[serial_test::serial]
async fn overwriting_the_blob_also_enqueues_the_security_email() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    app.request(
        "PUT",
        "/me/recovery-key-mnemonic",
        Some(&token),
        Some(json!({ "encryptedDek": "blob-v1" })),
    )
    .await;

    let (status, _) = app
        .request(
            "PUT",
            "/me/recovery-key-mnemonic",
            Some(&token),
            Some(json!({ "encryptedDek": "blob-v2" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        job_was_enqueued(
            &env.redis.url(),
            "recovery-key-mnemonic:set-email",
            "owner@example.com",
        )
        .await,
        "an overwriting PUT must also enqueue the security email"
    );
}

// ---------------------------------------------------------------------------
// get_recovery_key_mnemonic (GET /me/recovery-key-mnemonic)
// ---------------------------------------------------------------------------

/// The only safety net this path has - every fetch, successful or not,
/// must alert the owner immediately, since the server can never verify
/// the client actually decrypted the blob correctly.
#[tokio::test]
#[serial_test::serial]
async fn fetching_the_blob_always_enqueues_the_security_email() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    app.request(
        "PUT",
        "/me/recovery-key-mnemonic",
        Some(&token),
        Some(json!({ "encryptedDek": "blob" })),
    )
    .await;

    let (status, _) = app
        .request("GET", "/me/recovery-key-mnemonic", Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    assert!(
        job_was_enqueued(
            &env.redis.url(),
            "recovery-key-mnemonic:fetched-email",
            "owner@example.com",
        )
        .await,
        "a successful fetch must enqueue the security email"
    );
}

/// A 404 (nothing ever set up) still emails - someone probing this
/// endpoint on an account with no phrase configured is itself signal.
#[tokio::test]
#[serial_test::serial]
async fn fetching_a_never_set_up_blob_is_not_found_but_still_emails() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;

    let (status, _) = app
        .request("GET", "/me/recovery-key-mnemonic", Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(
        job_was_enqueued(
            &env.redis.url(),
            "recovery-key-mnemonic:fetched-email",
            "owner@example.com",
        )
        .await,
        "even a 404 fetch must enqueue the security email"
    );
}

// ---------------------------------------------------------------------------
// activate_via_recovery_key_mnemonic (POST /me/recovery-key-mnemonic/activate)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn activating_a_pending_device_makes_it_active_immediately() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_active_token = app.sign_in("owner@example.com").await;
    register_device(&app, &owner_active_token, "pk-owner-d1", "ios").await;

    let pending_token = app.sign_in("owner@example.com").await;
    let pending_device = register_device(&app, &pending_token, "pk-owner-d2", "android").await;
    assert_eq!(pending_device["status"], "pending");

    let (status, activated) = app
        .request(
            "POST",
            "/me/recovery-key-mnemonic/activate",
            Some(&pending_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{activated}");
    assert_eq!(activated["status"], "active");

    let (status, devices) = app
        .request("GET", "/me/devices", Some(&pending_token), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let devices = devices.as_array().expect("should be an array");
    let device = devices
        .iter()
        .find(|d| d["id"] == activated["id"])
        .expect("activated device should still have a row");
    assert_eq!(device["status"], "active");
}

/// The owner must hear about this from the server itself, not rely on the
/// mobile client's habit of calling `GET` (which separately emails) right
/// before this - a different client, or a resumed/retried flow that skips
/// the `GET`, would otherwise activate + suspend every sibling with zero
/// email to the owner.
#[tokio::test]
#[serial_test::serial]
async fn activating_enqueues_its_own_security_email() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_active_token = app.sign_in("owner@example.com").await;
    register_device(&app, &owner_active_token, "pk-owner-d1", "ios").await;

    let pending_token = app.sign_in("owner@example.com").await;
    register_device(&app, &pending_token, "pk-owner-d2", "android").await;

    let (status, activated) = app
        .request(
            "POST",
            "/me/recovery-key-mnemonic/activate",
            Some(&pending_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{activated}");
    assert!(
        job_was_enqueued(
            &env.redis.url(),
            "recovery-key-mnemonic:activated-email",
            "owner@example.com",
        )
        .await,
        "activating via the phrase must enqueue its own security email, independent of GET"
    );
}

#[tokio::test]
#[serial_test::serial]
async fn activating_cancels_any_in_flight_recovery_request_without_reviving_siblings() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;

    let (status, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{request}");

    let (status, activated) = app
        .request(
            "POST",
            "/me/recovery-key-mnemonic/activate",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{activated}");

    let (status, current) = app
        .request(
            "GET",
            "/me/recovery-requests/current",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "the in-flight trusted-contacts request must be cancelled, not left dangling"
    );
    let _ = current;

    // Both paths answer the same "I have no access to my other devices"
    // declaration - activating via the phrase must have the final word on
    // every sibling, even one the cancelled request's own restore step
    // had just put back to `active`.
    let (status, devices) = app
        .request("GET", "/me/devices", Some(&setup.owner_token), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let other_device = devices
        .as_array()
        .expect("should be an array")
        .iter()
        .find(|d| d["publicKey"] == "pk-owner-d1")
        .expect("the other device should still have a row");
    assert_eq!(
        other_device["status"], "suspended",
        "recovering via the phrase must still lock out a device that was only revived \
         by cancelling the dangling trusted-contacts request"
    );
}

/// Mirrors `create_recovery_request_revokes_every_other_devices_session`
/// (`recovery_requests.rs`) - the two paths answer the identical "I have
/// no access to my other devices" declaration, so recovering via the
/// phrase must suspend and revoke siblings exactly like starting a
/// trusted-contacts request does. Without this, a genuinely lost device
/// stays fully active and usable after the account is recovered on a new
/// one.
#[tokio::test]
#[serial_test::serial]
async fn activating_suspends_and_revokes_every_other_device() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_active_token = app.sign_in("owner@example.com").await;
    register_device(&app, &owner_active_token, "pk-owner-d1", "ios").await;

    let pending_token = app.sign_in("owner@example.com").await;
    register_device(&app, &pending_token, "pk-owner-d2", "android").await;

    let (status, _) = app
        .request("GET", "/me/devices", Some(&owner_active_token), None)
        .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "the other device's session should still work before recovery"
    );

    let (status, activated) = app
        .request(
            "POST",
            "/me/recovery-key-mnemonic/activate",
            Some(&pending_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{activated}");

    let (status, _) = app
        .request("GET", "/me/devices", Some(&owner_active_token), None)
        .await;
    assert_eq!(
        status,
        StatusCode::UNAUTHORIZED,
        "the other device's session should be revoked, not just its device row suspended"
    );

    // The activating device's own session must survive - it's the one
    // that just made the call.
    let (status, devices) = app
        .request("GET", "/me/devices", Some(&pending_token), None)
        .await;
    assert_eq!(status, StatusCode::OK);
    let other_device = devices
        .as_array()
        .expect("should be an array")
        .iter()
        .find(|d| d["publicKey"] == "pk-owner-d1")
        .expect("the other device should still have a row");
    assert_eq!(other_device["status"], "suspended");
}

#[tokio::test]
#[serial_test::serial]
async fn activating_an_already_active_device_is_forbidden() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    register_device(&app, &token, "pk-d1", "ios").await;

    let (status, _) = app
        .request(
            "POST",
            "/me/recovery-key-mnemonic/activate",
            Some(&token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN);
}

#[tokio::test]
#[serial_test::serial]
async fn activating_with_no_registered_device_is_a_bad_request() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;

    let (status, _) = app
        .request(
            "POST",
            "/me/recovery-key-mnemonic/activate",
            Some(&token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
#[serial_test::serial]
async fn activating_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request("POST", "/me/recovery-key-mnemonic/activate", None, None)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
