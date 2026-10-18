use api_testkit::{fresh_app, register_device, setup_recovery_scenario, shared_test_env};
use axum::http::StatusCode;
use sea_orm::{ConnectionTrait, Database};
use serde_json::json;

/// Pushes `request.id`'s `releaseAt` into the past directly in the
/// database - the exact step a `queue.promote()`-only "fast-forward"
/// misses (see this session's own `release_at` reminder): BullMQ and the
/// DB column are two independent clocks, and only the DB one gates
/// `list_recovery_request_shares`.
async fn fast_forward_release_at(database_url: &str, request_id: &str) {
    let db = Database::connect(database_url.to_string())
        .await
        .expect("failed to connect to fast-forward release_at");
    db.execute_unprepared(&format!(
        "UPDATE recovery_request SET release_at = now() - interval '1 minute' WHERE id = '{request_id}'"
    ))
    .await
    .expect("failed to fast-forward release_at");
}

/// `GET /current` only ever surfaces a `pending` request - once a decline
/// trips `fail_if_unrecoverable`, a direct read is the only way left to
/// observe the transition, same reasoning as `fast_forward_release_at`'s
/// own for going straight to the database.
async fn fetch_request_status(database_url: &str, request_id: &str) -> (String, bool) {
    let db = Database::connect(database_url.to_string())
        .await
        .expect("failed to connect to read recovery request status");
    let row = db
        .query_one_raw(sea_orm::Statement::from_string(
            db.get_database_backend(),
            format!(
                "SELECT status::text AS status, failed_at IS NOT NULL AS has_failed_at FROM recovery_request WHERE id = '{request_id}'"
            ),
        ))
        .await
        .expect("failed to query recovery request status")
        .expect("recovery request not found");
    let status: String = row.try_get("", "status").expect("missing status column");
    let has_failed_at: bool = row
        .try_get("", "has_failed_at")
        .expect("missing has_failed_at column");
    (status, has_failed_at)
}

// ---------------------------------------------------------------------------
// create_recovery_request (POST /me/recovery-requests)
// ---------------------------------------------------------------------------

/// End-to-end "I lost my other devices" flow, entirely through real HTTP
/// requests against the real router, a real Postgres and a real Redis -
/// the same shape as what was tested by hand this session.
#[tokio::test]
#[serial_test::serial]
async fn full_recovery_flow_from_creation_to_shares() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let token_b = &setup.contact_tokens[0];

    let (status, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{request}");
    let request_id = request["id"].as_str().unwrap().to_string();
    assert_eq!(request["totalContacts"], 1);
    assert_eq!(request["approvedContacts"], 0);

    // The real enqueue, in the real queue - not an assumption about what
    // `create_recovery_request` *should* have sent.
    let redis_client =
        redis::Client::open(env.redis.url()).expect("invalid redis url for assertion");
    let mut redis_conn = redis_client
        .get_multiplexed_async_connection()
        .await
        .expect("failed to connect to redis for assertion");
    let job_keys: Vec<String> = redis::cmd("KEYS")
        .arg("bull:notify_queue:*")
        .query_async(&mut redis_conn)
        .await
        .expect("KEYS failed");
    let mut saw_created_push = false;
    for key in &job_keys {
        let name: Option<String> = redis::cmd("HGET")
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
        if name.as_deref() == Some("push:notification")
            && data
                .as_deref()
                .is_some_and(|d| d.contains("recovery-request-created"))
        {
            saw_created_push = true;
        }
    }
    assert!(
        saw_created_push,
        "expected a push:notification/recovery-request-created job in redis, got keys: {job_keys:?}"
    );

    let (status, pending) = app
        .request("GET", "/me/pending-actions", Some(token_b), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{pending}");
    let contact_action = pending
        .as_array()
        .expect("pending-actions response should be an array")
        .iter()
        .find(|action| action["kind"] == "recovery_request_contact")
        .expect("expected a recovery_request_contact pending action for the contact");
    let contact_recovery_request_id = contact_action["recoveryRequestId"]
        .as_str()
        .expect("pending action missing recoveryRequestId");
    assert_eq!(contact_recovery_request_id, request_id);

    let (status, approved) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{contact_recovery_request_id}/approve"),
            Some(token_b),
            Some(json!({ "encryptedShare": "test-sealed-share-blob" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{approved}");

    let (status, _) = app
        .request(
            "GET",
            &format!("/me/recovery-requests/{request_id}/shares"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::LOCKED);

    fast_forward_release_at(&env.db.database_url(), &request_id).await;

    let (status, shares) = app
        .request(
            "GET",
            &format!("/me/recovery-requests/{request_id}/shares"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{shares}");
    let shares = shares
        .as_array()
        .expect("shares response should be an array");
    assert_eq!(shares.len(), 1);
    assert_eq!(shares[0]["encryptedShare"], "test-sealed-share-blob");
}

/// The server refuses outright rather than wiping every sibling device
/// for a request that could never reach quorum - see
/// `create_recovery_request`'s own doc comment.
#[tokio::test]
#[serial_test::serial]
async fn create_recovery_request_requires_an_accepted_contact() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token1 = app.sign_in("owner@example.com").await;
    register_device(&app, &token1, "pk-d1", "ios").await;

    let token2 = app.sign_in("owner@example.com").await;
    register_device(&app, &token2, "pk-d2", "android").await;

    let (status, body) = app
        .request("POST", "/me/recovery-requests", Some(&token2), None)
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

/// A still-pending (unredeemed) contact doesn't count towards quorum,
/// even though a row for them exists.
#[tokio::test]
#[serial_test::serial]
async fn create_recovery_request_ignores_non_accepted_contacts() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    register_device(&app, &owner_token, "pk-d1", "ios").await;
    // An invite that nobody has redeemed yet - still `pending`.
    app.request(
        "GET",
        "/me/trusted-contacts/invite",
        Some(&owner_token),
        None,
    )
    .await;

    let pending_token = app.sign_in("owner@example.com").await;
    register_device(&app, &pending_token, "pk-d2", "android").await;

    let (status, body) = app
        .request("POST", "/me/recovery-requests", Some(&pending_token), None)
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

/// Recovery is only for a device that doesn't have the key yet - an
/// already-`active` caller is refused rather than silently wiping every
/// other device for no reason.
#[tokio::test]
#[serial_test::serial]
async fn create_recovery_request_rejects_an_already_active_device() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let device = register_device(&app, &token, "pk-d1", "ios").await;
    assert_eq!(device["status"], "active");

    let (status, body) = app
        .request("POST", "/me/recovery-requests", Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn create_recovery_request_requires_the_device_to_be_registered_first() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    // Signed in, but never called PUT /me/devices from this session.
    let token = app.sign_in("owner@example.com").await;
    let (status, body) = app
        .request("POST", "/me/recovery-requests", Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

/// Every accepted contact gets a row - not just the first one.
#[tokio::test]
#[serial_test::serial]
async fn create_recovery_request_asks_every_accepted_contact() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(
        &app,
        "owner@example.com",
        &[
            "contact-a@example.com",
            "contact-b@example.com",
            "contact-c@example.com",
        ],
    )
    .await;

    let (status, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{request}");
    assert_eq!(request["totalContacts"], 3);
}

/// Starting a recovery request hard-deletes every *other* device on the
/// account - the point of the flow is "none of my other devices can
/// help."
#[tokio::test]
#[serial_test::serial]
async fn create_recovery_request_wipes_every_other_device() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;

    app.request(
        "POST",
        "/me/recovery-requests",
        Some(&setup.owner_token),
        None,
    )
    .await;

    let (status, devices) = app
        .request("GET", "/me/devices", Some(&setup.owner_token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{devices}");
    let devices = devices.as_array().expect("should be an array");
    assert_eq!(
        devices.len(),
        1,
        "only the requesting device itself should survive"
    );
}

/// Starting a second recovery request (the requesting device is still
/// the sole survivor, still `pending`, so it's allowed to call this
/// again) cancels the first instead of leaving two pending requests
/// around.
#[tokio::test]
#[serial_test::serial]
async fn starting_a_new_recovery_request_cancels_the_previous_one() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;

    let (_, first) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let first_id = first["id"].as_str().unwrap().to_string();

    let (status, second) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{second}");
    let second_id = second["id"].as_str().unwrap().to_string();
    assert_ne!(first_id, second_id);

    let (status, current) = app
        .request(
            "GET",
            "/me/recovery-requests/current",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{current}");
    assert_eq!(current["id"], second_id);
}

// ---------------------------------------------------------------------------
// get_current_recovery_request (GET /me/recovery-requests/current)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn get_current_is_not_found_when_there_is_none() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (status, _) = app
        .request("GET", "/me/recovery-requests/current", Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
#[serial_test::serial]
async fn get_current_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request("GET", "/me/recovery-requests/current", None, None)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// cancel_recovery_request (DELETE /me/recovery-requests/{id})
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn owner_can_cancel_their_own_pending_request() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap();

    let (status, _) = app
        .request(
            "DELETE",
            &format!("/me/recovery-requests/{request_id}"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = app
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
        "a cancelled request is no longer \"current\""
    );
}

#[tokio::test]
#[serial_test::serial]
async fn cancelling_a_nonexistent_request_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (status, _) = app
        .request(
            "DELETE",
            "/me/recovery-requests/00000000-0000-0000-0000-000000000000",
            Some(&token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
#[serial_test::serial]
async fn cancelling_someone_elses_request_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap();

    let other_token = app.sign_in("stranger@example.com").await;
    let (status, body) = app
        .request(
            "DELETE",
            &format!("/me/recovery-requests/{request_id}"),
            Some(&other_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn cancelling_an_already_cancelled_request_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap().to_string();

    app.request(
        "DELETE",
        &format!("/me/recovery-requests/{request_id}"),
        Some(&setup.owner_token),
        None,
    )
    .await;

    let (status, body) = app
        .request(
            "DELETE",
            &format!("/me/recovery-requests/{request_id}"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

// ---------------------------------------------------------------------------
// complete_recovery_request (POST /me/recovery-requests/{id}/complete)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn completing_activates_the_requesting_device() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap();

    let (status, completed) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{request_id}/complete"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{completed}");
    assert_eq!(completed["status"], "completed");

    let (status, devices) = app
        .request("GET", "/me/devices", Some(&setup.owner_token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{devices}");
    assert_eq!(devices[0]["status"], "active");
}

/// The server never counts shares or enforces a threshold - the Shamir
/// quorum lives entirely client-side (see `MeRecoveryRequestsResponse`'s
/// own doc comment), so `complete` succeeds even with zero approvals.
/// The server trusts the requesting device to only call this once it has
/// actually reconstructed the key on its own.
#[tokio::test]
#[serial_test::serial]
async fn completing_with_zero_approvals_still_succeeds() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap();

    let (status, completed) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{request_id}/complete"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{completed}");
    assert_eq!(completed["approvedContacts"], 0);
}

#[tokio::test]
#[serial_test::serial]
async fn completing_a_nonexistent_request_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (status, _) = app
        .request(
            "POST",
            "/me/recovery-requests/00000000-0000-0000-0000-000000000000/complete",
            Some(&token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
#[serial_test::serial]
async fn completing_someone_elses_request_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap();

    let other_token = app.sign_in("stranger@example.com").await;
    let (status, body) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{request_id}/complete"),
            Some(&other_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn completing_an_already_completed_request_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap().to_string();

    app.request(
        "POST",
        &format!("/me/recovery-requests/{request_id}/complete"),
        Some(&setup.owner_token),
        None,
    )
    .await;

    let (status, body) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{request_id}/complete"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

// ---------------------------------------------------------------------------
// approve_recovery_request / decline_recovery_request
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn contact_can_decline() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let token_b = &setup.contact_tokens[0];
    app.request(
        "POST",
        "/me/recovery-requests",
        Some(&setup.owner_token),
        None,
    )
    .await;

    let (_, pending) = app
        .request("GET", "/me/pending-actions", Some(token_b), None)
        .await;
    let request_id = pending[0]["recoveryRequestId"].as_str().unwrap();

    let (status, declined) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{request_id}/decline"),
            Some(token_b),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{declined}");
    assert_eq!(declined["status"], "declined");

    // The sole contact declining leaves zero approvals with nothing left
    // pending - the one case `fail_if_unrecoverable` can actually tell is
    // unrecoverable. `GET /current` only ever surfaces a `pending`
    // request (same reasoning as why it already 404s the instant one is
    // cancelled - see `cancelling_an_already_cancelled_request_is_not_found`),
    // so the transition itself is only observable via a direct read -
    // same reasoning as `fast_forward_release_at`'s own.
    let (status, _) = app
        .request(
            "GET",
            "/me/recovery-requests/current",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (db_status, has_failed_at) = fetch_request_status(&env.db.database_url(), request_id).await;
    assert_eq!(db_status, "failed");
    assert!(has_failed_at);
}

/// Someone who was never asked about this request (not a trusted contact
/// of this owner at all) has no standing to approve or decline it.
#[tokio::test]
#[serial_test::serial]
async fn a_stranger_cannot_approve_or_decline() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap();

    let stranger_token = app.sign_in("stranger@example.com").await;
    let (status, body) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{request_id}/approve"),
            Some(&stranger_token),
            Some(json!({ "encryptedShare": "blob" })),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");

    let (status, body) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{request_id}/decline"),
            Some(&stranger_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

/// Can't respond twice - once a contact row is resolved, it's no longer
/// `pending`, so a second attempt just finds nothing left to act on for
/// that contact.
#[tokio::test]
#[serial_test::serial]
async fn responding_twice_to_the_same_request_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let token_b = &setup.contact_tokens[0];
    app.request(
        "POST",
        "/me/recovery-requests",
        Some(&setup.owner_token),
        None,
    )
    .await;

    let (_, pending) = app
        .request("GET", "/me/pending-actions", Some(token_b), None)
        .await;
    let request_id = pending[0]["recoveryRequestId"]
        .as_str()
        .unwrap()
        .to_string();

    app.request(
        "POST",
        &format!("/me/recovery-requests/{request_id}/decline"),
        Some(token_b),
        None,
    )
    .await;

    let (status, body) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{request_id}/approve"),
            Some(token_b),
            Some(json!({ "encryptedShare": "blob" })),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

/// Approving/declining a request that's no longer `pending` (cancelled
/// here) is refused - `find_contact_row` filters the *request's* own
/// status first, before ever looking at the contact row.
#[tokio::test]
#[serial_test::serial]
async fn cannot_respond_to_a_cancelled_request() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let token_b = &setup.contact_tokens[0];
    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap().to_string();

    app.request(
        "DELETE",
        &format!("/me/recovery-requests/{request_id}"),
        Some(&setup.owner_token),
        None,
    )
    .await;

    let (status, body) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{request_id}/decline"),
            Some(token_b),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn approve_rejects_a_malformed_id() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (status, _) = app
        .request(
            "POST",
            "/me/recovery-requests/not-a-uuid/approve",
            Some(&token),
            Some(json!({ "encryptedShare": "blob" })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

// ---------------------------------------------------------------------------
// Scenario: every contact declines
// ---------------------------------------------------------------------------

/// Every asked contact declining is the one case the server can tell,
/// without ever knowing the Shamir threshold, is unrecoverable - zero
/// approvals and nothing left pending means zero shares, full stop, no
/// matter what that threshold is (see `fail_if_unrecoverable`'s own doc
/// comment). The request auto-transitions to `failed`, and `shares` still
/// comes back an empty (but still 200) array once released - the server
/// recording "this can't succeed" doesn't change what it hands back for
/// an already-released request, it's still just reporting what it has.
#[tokio::test]
#[serial_test::serial]
async fn when_every_contact_declines_the_request_fails() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(
        &app,
        "owner@example.com",
        &["contact-a@example.com", "contact-b@example.com"],
    )
    .await;

    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap().to_string();

    for token in &setup.contact_tokens {
        let (_, pending) = app
            .request("GET", "/me/pending-actions", Some(token), None)
            .await;
        let id = pending[0]["recoveryRequestId"].as_str().unwrap();
        let (status, declined) = app
            .request(
                "POST",
                &format!("/me/recovery-requests/{id}/decline"),
                Some(token),
                None,
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{declined}");
    }

    let (status, _) = app
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
        "no longer `pending` - failed"
    );

    let (db_status, has_failed_at) =
        fetch_request_status(&env.db.database_url(), &request_id).await;
    assert_eq!(db_status, "failed");
    assert!(has_failed_at);

    fast_forward_release_at(&env.db.database_url(), &request_id).await;

    let (status, shares) = app
        .request(
            "GET",
            &format!("/me/recovery-requests/{request_id}/shares"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{shares}");
    assert_eq!(
        shares.as_array().expect("should be an array").len(),
        0,
        "no approvals means no shares, but still a successful empty response"
    );
}

// ---------------------------------------------------------------------------
// Scenario: the majority declines - the server still just reports what
// happened, it never decides "that's not enough"
// ---------------------------------------------------------------------------

/// With 3 contacts asked and only 1 approving, `shares` returns exactly
/// that one share after release - the server has no concept of "quorum
/// not reached," it's the client's job to decide 1-of-3 isn't enough to
/// reconstruct the key.
#[tokio::test]
#[serial_test::serial]
async fn when_the_majority_declines_only_the_approved_share_is_returned() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(
        &app,
        "owner@example.com",
        &[
            "contact-a@example.com",
            "contact-b@example.com",
            "contact-c@example.com",
        ],
    )
    .await;

    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let request_id = request["id"].as_str().unwrap().to_string();

    // A and B decline, C approves.
    for token in &setup.contact_tokens[..2] {
        let (_, pending) = app
            .request("GET", "/me/pending-actions", Some(token), None)
            .await;
        let id = pending[0]["recoveryRequestId"].as_str().unwrap();
        app.request(
            "POST",
            &format!("/me/recovery-requests/{id}/decline"),
            Some(token),
            None,
        )
        .await;
    }
    let approving_token = &setup.contact_tokens[2];
    let (_, pending) = app
        .request("GET", "/me/pending-actions", Some(approving_token), None)
        .await;
    let id = pending[0]["recoveryRequestId"].as_str().unwrap();
    app.request(
        "POST",
        &format!("/me/recovery-requests/{id}/approve"),
        Some(approving_token),
        Some(json!({ "encryptedShare": "only-approved-blob" })),
    )
    .await;

    let (_, current) = app
        .request(
            "GET",
            "/me/recovery-requests/current",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(current["totalContacts"], 3);
    assert_eq!(current["declinedContacts"], 2);
    assert_eq!(current["approvedContacts"], 1);
    assert_eq!(current["status"], "pending");

    fast_forward_release_at(&env.db.database_url(), &request_id).await;

    let (status, shares) = app
        .request(
            "GET",
            &format!("/me/recovery-requests/{request_id}/shares"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{shares}");
    let shares = shares.as_array().expect("should be an array");
    assert_eq!(shares.len(), 1);
    assert_eq!(shares[0]["encryptedShare"], "only-approved-blob");
}

// ---------------------------------------------------------------------------
// Scenario: a trusted contact is revoked while a recovery request they
// were asked about is still in flight
// ---------------------------------------------------------------------------

/// A contact's already-sealed share lives on their own device regardless
/// of what the server does - revoking the relationship can never recall
/// it. But a `Pending` row on an in-flight request is the owner's
/// standing *ask* for that share, and revoking mid-recovery is a clear
/// enough signal that the ask itself should be withdrawn too:
/// `revoke_trusted_contact` now also declines any `Pending`
/// `recovery_request_contact` row for that relationship (see
/// `decline_pending_response_on_revoke`), so the now-revoked contact can
/// no longer approve or decline a request they were asked about before
/// the revoke - `find_contact_row` only ever matches a still-`Pending`
/// contact row, and theirs no longer is one.
#[tokio::test]
#[serial_test::serial]
async fn revoking_a_contact_mid_recovery_withdraws_their_pending_response() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(&app, "owner@example.com", &["contact@example.com"]).await;
    let token_b = &setup.contact_tokens[0];

    app.request(
        "POST",
        "/me/recovery-requests",
        Some(&setup.owner_token),
        None,
    )
    .await;

    let (_, pending) = app
        .request("GET", "/me/pending-actions", Some(token_b), None)
        .await;
    let request_id = pending[0]["recoveryRequestId"]
        .as_str()
        .unwrap()
        .to_string();

    // The owner revokes the contact *while the request is still pending* -
    // note this uses the owner's *new* (post-wipe) session, the only one
    // left standing after `create_recovery_request` wiped the others.
    let (_, mine) = app
        .request(
            "GET",
            "/me/trusted-contacts",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let relationship_id = mine[0]["id"].as_str().unwrap();
    let (status, _) = app
        .request(
            "DELETE",
            &format!("/me/trusted-contacts/{relationship_id}"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    // The now-revoked contact can no longer approve the request - their
    // standing ask was withdrawn the moment they were revoked.
    let (status, approved) = app
        .request(
            "POST",
            &format!("/me/recovery-requests/{request_id}/approve"),
            Some(token_b),
            Some(json!({ "encryptedShare": "blob-from-a-revoked-contact" })),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{approved}");

    // The sole contact's withdrawn ask leaves zero approvals with nothing
    // left pending - the same unrecoverable case a plain decline would
    // trigger (see `fail_if_unrecoverable`).
    let (db_status, has_failed_at) =
        fetch_request_status(&env.db.database_url(), &request_id).await;
    assert_eq!(db_status, "failed");
    assert!(has_failed_at);

    fast_forward_release_at(&env.db.database_url(), &request_id).await;
    let (status, shares) = app
        .request(
            "GET",
            &format!("/me/recovery-requests/{request_id}/shares"),
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{shares}");
    assert_eq!(
        shares.as_array().expect("should be an array").len(),
        0,
        "the withdrawn contact never got to submit a share"
    );
}

/// Revoking the relationship doesn't retroactively shrink an in-flight
/// request's own already-snapshotted contact count - it still shows up
/// as one of the `totalContacts` asked, just now resolved as `declined`
/// rather than left `pending` forever (see
/// `decline_pending_response_on_revoke`). Uses two contacts, deliberately -
/// revoking the *only* contact would also trip `fail_if_unrecoverable`
/// (covered by `revoking_a_contact_mid_recovery_withdraws_their_pending_response`),
/// which would make the request itself unobservable via `GET /current`
/// and muddy what this test is actually checking.
#[tokio::test]
#[serial_test::serial]
async fn revoking_a_contact_mid_recovery_does_not_change_the_requests_own_counts() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let setup = setup_recovery_scenario(
        &app,
        "owner@example.com",
        &["contact-a@example.com", "contact-b@example.com"],
    )
    .await;
    let (_, request) = app
        .request(
            "POST",
            "/me/recovery-requests",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(request["totalContacts"], 2);

    let (_, mine) = app
        .request(
            "GET",
            "/me/trusted-contacts",
            Some(&setup.owner_token),
            None,
        )
        .await;
    let relationship_id = mine[0]["id"].as_str().unwrap();
    app.request(
        "DELETE",
        &format!("/me/trusted-contacts/{relationship_id}"),
        Some(&setup.owner_token),
        None,
    )
    .await;

    let (status, current) = app
        .request(
            "GET",
            "/me/recovery-requests/current",
            Some(&setup.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{current}");
    assert_eq!(
        current["totalContacts"], 2,
        "the snapshot taken at creation time doesn't shrink just because the relationship was revoked after"
    );
    assert_eq!(
        current["declinedContacts"], 1,
        "the revoked contact's standing ask was withdrawn as a decline, not just erased"
    );
    assert_eq!(
        current["status"], "pending",
        "the other contact hasn't responded yet, so this isn't unrecoverable"
    );
}

#[tokio::test]
#[serial_test::serial]
async fn create_recovery_request_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request("POST", "/me/recovery-requests", None, None)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
