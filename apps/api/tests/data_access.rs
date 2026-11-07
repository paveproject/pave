use api_testkit::{
    fresh_app, register_device, shared_test_env, sign_in_as_accepted_contact, TestApp, TestEnv,
};
use axum::http::StatusCode;
use sea_orm::{ConnectionTrait, Database};
use serde_json::json;
use uuid::Uuid;

/// Pushes `release_at` into the past directly in the database. The configured
/// delay floors at two hours (see `check_user_data_access_delay_minimum`), so
/// there is no test-friendly value to set instead - same approach as
/// `recovery_requests.rs`'s own `fast_forward_release_at`.
async fn fast_forward_release_at(database_url: &str, request_id: &str) {
    let db = Database::connect(database_url.to_string())
        .await
        .expect("failed to connect to fast-forward release_at");
    db.execute_unprepared(&format!(
        "UPDATE data_access_request SET release_at = now() - interval '1 minute' WHERE id = '{request_id}'"
    ))
    .await
    .expect("failed to fast-forward release_at");
}

/// Pushes `expires_at` into the past, to observe what an elapsed grant does.
async fn expire_request(database_url: &str, request_id: &str) {
    let db = Database::connect(database_url.to_string())
        .await
        .expect("failed to connect to expire the request");
    db.execute_unprepared(&format!(
        "UPDATE data_access_request SET release_at = now() - interval '2 minutes', \
         expires_at = now() - interval '1 minute' WHERE id = '{request_id}'"
    ))
    .await
    .expect("failed to expire the request");
}

/// Shifts a whole request back in time. Not `fast_forward_release_at`: that
/// one moves only `release_at`, leaving the row disagreeing with itself about
/// how long the window is - fine for "has the delay elapsed?", wrong for
/// anything measuring the window.
async fn age_request(database_url: &str, request_id: &str, days: i64) {
    let db = Database::connect(database_url.to_string())
        .await
        .expect("failed to connect to age the request");
    db.execute_unprepared(&format!(
        "UPDATE data_access_request SET \
         created_at = created_at - interval '{days} days', \
         release_at = release_at - interval '{days} days', \
         expires_at = expires_at - interval '{days} days' \
         WHERE id = '{request_id}'"
    ))
    .await
    .expect("failed to age the request");
}

/// The stored `status` is the thing under test; `access` in the response
/// would hide it behind the derived state.
async fn stored_row(
    database_url: &str,
    request_id: &str,
) -> (String, chrono::DateTime<chrono::Utc>) {
    let db = Database::connect(database_url.to_string())
        .await
        .expect("failed to connect to read the request row");
    let row = db
        .query_one_raw(sea_orm::Statement::from_string(
            sea_orm::DatabaseBackend::Postgres,
            format!(
                "SELECT status::text AS status, expires_at \
                 FROM data_access_request WHERE id = '{request_id}'"
            ),
        ))
        .await
        .expect("failed to read the request row")
        .expect("a row");
    (
        row.try_get("", "status").expect("status"),
        row.try_get("", "expires_at").expect("expires_at"),
    )
}

struct Net {
    owner_token: String,
    owner_id: String,
    /// The contact who asks.
    requester_token: String,
    /// The other contact, whose approval forms the quorum.
    other_token: String,
}

/// Two contacts is the smallest net where a quorum of *others* means
/// anything: the requester is excluded, leaving a required majority of one.
async fn net_of_two(app: &TestApp) -> Net {
    let owner_token = app.sign_in("owner@example.com").await;
    register_device(app, &owner_token, "pk-owner", "ios").await;
    let owner_id = app.user_id(&owner_token).await;

    let requester_token =
        sign_in_as_accepted_contact(app, &owner_token, "requester@example.com").await;
    register_device(app, &requester_token, "pk-requester", "ios").await;

    let other_token = sign_in_as_accepted_contact(app, &owner_token, "other@example.com").await;
    register_device(app, &other_token, "pk-other", "android").await;

    Net {
        owner_token,
        owner_id,
        requester_token,
        other_token,
    }
}

async fn start_request(app: &TestApp, net: &Net) -> String {
    let (status, body) = app
        .request(
            "POST",
            &format!("/user/{}/data-access/requests", net.owner_id),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body["id"].as_str().expect("request id").to_string()
}

async fn approve(app: &TestApp, token: &str, request_id: &str) -> StatusCode {
    let (status, _) = app
        .request(
            "POST",
            &format!("/data-access/request/{request_id}/approve"),
            Some(token),
            Some(json!({ "encryptedShare": "sealed-to-the-requesting-device" })),
        )
        .await;
    status
}

async fn shares(app: &TestApp, token: &str, request_id: &str) -> (StatusCode, serde_json::Value) {
    app.request(
        "GET",
        &format!("/data-access/request/{request_id}/shares"),
        Some(token),
        None,
    )
    .await
}

/// The caller's `data_access*` pending actions as `(kind, id)` pairs.
async fn data_access_inbox(app: &TestApp, token: &str) -> Vec<(String, serde_json::Value)> {
    let (status, body) = app
        .request("GET", "/me/pending-actions", Some(token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    body.as_array()
        .expect("a list")
        .iter()
        .filter_map(|action| {
            let kind = action["kind"].as_str()?.to_string();
            kind.starts_with("data_access")
                .then(|| (kind, action["id"].clone()))
        })
        .collect()
}

/// A session owned by `owner_token`, with one blob, to read back later.
async fn owner_records_a_session(app: &TestApp, owner_token: &str) -> (String, String) {
    let session = Uuid::new_v4().to_string();
    app.request(
        "PUT",
        &format!("/protest-session/{session}"),
        Some(owner_token),
        Some(json!({ "sealedKey": "sealed-session-key", "metadata": "encrypted-envelope" })),
    )
    .await;

    let blob = Uuid::new_v4().to_string();
    let boundary = "x-test-boundary";
    let mut body = Vec::new();
    for (name, value) in [("kind", "position_batch"), ("seq", "0")] {
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
    body.extend_from_slice(b"ciphertext");
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    app.request_multipart(
        "PUT",
        &format!("/protest-session/{session}/blob/{blob}"),
        owner_token,
        boundary,
        body,
    )
    .await;

    (session, blob)
}

async fn open_access(app: &TestApp, env: &TestEnv, net: &Net) -> String {
    let request_id = start_request(app, net).await;
    assert_eq!(
        approve(app, &net.other_token, &request_id).await,
        StatusCode::OK
    );
    fast_forward_release_at(&env.db.database_url(), &request_id).await;
    request_id
}

// ---------------------------------------------------------------------------
// starting a request
// ---------------------------------------------------------------------------

/// The relationship is the authorisation: only an accepted contact can ask.
#[tokio::test]
#[serial_test::serial]
async fn a_stranger_cannot_ask_for_access() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let stranger = app.sign_in("stranger@example.com").await;
    register_device(&app, &stranger, "pk-stranger", "ios").await;

    let (status, _) = app
        .request(
            "POST",
            &format!("/user/{}/data-access/requests", net.owner_id),
            Some(&stranger),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

/// Asking for your own data is what `/me` and the owner branch of
/// `authorize_user_scope` are for.
#[tokio::test]
#[serial_test::serial]
async fn an_owner_cannot_ask_for_their_own_data() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;

    let (status, _) = app
        .request(
            "POST",
            &format!("/user/{}/data-access/requests", net.owner_id),
            Some(&net.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

/// The partial unique index, surfaced as something a client can act on.
#[tokio::test]
#[serial_test::serial]
async fn a_second_pending_request_from_the_same_contact_conflicts() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    start_request(&app, &net).await;

    let (status, _) = app
        .request(
            "POST",
            &format!("/user/{}/data-access/requests", net.owner_id),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
}

/// The request is created asking every *other* accepted contact, never the
/// requester - nobody votes on their own request.
#[tokio::test]
#[serial_test::serial]
async fn a_request_asks_the_other_contacts_and_not_the_requester() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;

    let (status, body) = app
        .request(
            "GET",
            &format!("/data-access/request/{request_id}"),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["totalContacts"], 1, "only the other contact is asked");
    assert_eq!(body["requiredApprovals"], 1);
    assert_eq!(body["approvedContacts"], 0);
    assert_eq!(body["access"], "waiting");
}

// ---------------------------------------------------------------------------
// the delay and the quorum
// ---------------------------------------------------------------------------

/// Both gates, in order: no quorum means no access even after the delay, and
/// a quorum means no access until the delay has passed.
#[tokio::test]
#[serial_test::serial]
async fn shares_stay_locked_without_a_quorum_and_before_the_delay() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;

    // Delay elapsed, nobody approved.
    fast_forward_release_at(&env.db.database_url(), &request_id).await;
    let (status, _) = shares(&app, &net.requester_token, &request_id).await;
    assert_eq!(status, StatusCode::LOCKED, "no quorum, no access");

    // Quorum reached, but the clock was wound back - a fresh request.
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;
    assert_eq!(
        approve(&app, &net.other_token, &request_id).await,
        StatusCode::OK
    );
    let (status, _) = shares(&app, &net.requester_token, &request_id).await;
    assert_eq!(
        status,
        StatusCode::LOCKED,
        "quorum but still inside the delay"
    );
}

/// The happy path, and the only one where the server hands anything over.
#[tokio::test]
#[serial_test::serial]
async fn a_quorum_and_the_delay_open_the_shares() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = open_access(&app, env, &net).await;

    let (status, body) = app
        .request(
            "GET",
            &format!("/data-access/request/{request_id}"),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["access"], "open");

    let (status, body) = shares(&app, &net.requester_token, &request_id).await;
    assert_eq!(status, StatusCode::OK, "{body}");
    let items = body.as_array().expect("shares array");
    assert_eq!(items.len(), 1);
    assert_eq!(
        items[0]["encryptedShare"],
        "sealed-to-the-requesting-device"
    );
}

/// Nobody but the requester gets the shares - not even the owner, who has no
/// use for envelopes sealed to someone else's device.
#[tokio::test]
#[serial_test::serial]
async fn the_owner_cannot_read_the_shares() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = open_access(&app, env, &net).await;

    let (status, _) = shares(&app, &net.owner_token, &request_id).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

/// Every other contact declined, so no threshold is reachable - say so rather
/// than leave the requester watching a counter that can never move.
#[tokio::test]
#[serial_test::serial]
async fn a_request_fails_once_no_quorum_is_reachable() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;

    let (status, _) = app
        .request(
            "POST",
            &format!("/data-access/request/{request_id}/decline"),
            Some(&net.other_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let (_, body) = app
        .request(
            "GET",
            &format!("/data-access/request/{request_id}"),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(body["access"], "failed");
    assert_eq!(body["status"], "failed");
}

// ---------------------------------------------------------------------------
// the owner's veto
// ---------------------------------------------------------------------------

/// Refusing inside the window means access never opens, quorum or not.
#[tokio::test]
#[serial_test::serial]
async fn the_owner_can_refuse_during_the_delay() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;
    assert_eq!(
        approve(&app, &net.other_token, &request_id).await,
        StatusCode::OK
    );

    let (status, body) = app
        .request(
            "POST",
            &format!("/data-access/request/{request_id}/refuse"),
            Some(&net.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["access"], "refused");

    fast_forward_release_at(&env.db.database_url(), &request_id).await;
    let (status, _) = shares(&app, &net.requester_token, &request_id).await;
    assert_eq!(status, StatusCode::LOCKED, "a refusal outranks the clock");
}

/// A grant is a window the owner can close, not a door left open.
#[tokio::test]
#[serial_test::serial]
async fn the_owner_can_refuse_after_access_opened() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = open_access(&app, env, &net).await;

    let (status, _) = shares(&app, &net.requester_token, &request_id).await;
    assert_eq!(status, StatusCode::OK, "open before the refusal");

    let (status, _) = app
        .request(
            "POST",
            &format!("/data-access/request/{request_id}/refuse"),
            Some(&net.owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let (status, _) = shares(&app, &net.requester_token, &request_id).await;
    assert_eq!(
        status,
        StatusCode::LOCKED,
        "reading stops the moment it is refused"
    );
}

/// Only the owner vetoes. A contact who was asked cannot refuse on their
/// behalf, and neither can the requester withdraw by this route.
#[tokio::test]
#[serial_test::serial]
async fn nobody_but_the_owner_can_refuse() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;

    for token in [&net.requester_token, &net.other_token] {
        let (status, _) = app
            .request(
                "POST",
                &format!("/data-access/request/{request_id}/refuse"),
                Some(token),
                None,
            )
            .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }
}

// ---------------------------------------------------------------------------
// the window closing
// ---------------------------------------------------------------------------

/// A closed window must not lock the contact out for good: the partial unique
/// index keys off the stored status, so before `close_if_expired` this was a
/// permanent 409.
#[tokio::test]
#[serial_test::serial]
async fn an_expired_window_can_be_asked_for_again() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let first = open_access(&app, env, &net).await;
    expire_request(&env.db.database_url(), &first).await;

    let (status, body) = app
        .request(
            "POST",
            &format!("/user/{}/data-access/requests", net.owner_id),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_ne!(body["id"].as_str().expect("an id"), first, "a new request");

    // The old one is written down, not just stepped over - otherwise the slot
    // would have to be re-freed on every future attempt.
    assert_eq!(
        stored_row(&env.db.database_url(), &first).await.0,
        "expired"
    );

    // And the new one is live, so the contact really is back in business.
    assert_eq!(body["access"], "waiting");
}

/// `close_if_expired` must not have turned the index into a no-op.
#[tokio::test]
#[serial_test::serial]
async fn a_live_window_still_blocks_a_second_request() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let first = open_access(&app, env, &net).await;

    let (status, _) = app
        .request(
            "POST",
            &format!("/user/{}/data-access/requests", net.owner_id),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::CONFLICT);
    assert_eq!(
        stored_row(&env.db.database_url(), &first).await.0,
        "pending"
    );
}

/// Same root cause as the test above: the feed filters on the stored status.
#[tokio::test]
#[serial_test::serial]
async fn an_expired_window_leaves_the_owners_inbox() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;
    assert_eq!(
        data_access_inbox(&app, &net.owner_token).await.len(),
        1,
        "shown while it stands"
    );

    expire_request(&env.db.database_url(), &request_id).await;
    assert!(
        data_access_inbox(&app, &net.owner_token).await.is_empty(),
        "and gone once the window closed"
    );
}

/// Measured from the moment access opens, not `release_at` - a slow quorum
/// would otherwise get only the remainder of a week already running.
#[tokio::test]
#[serial_test::serial]
async fn a_slow_quorum_gets_the_whole_window() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;

    // Five days pass with nobody approving: the delay is long gone and the
    // window creation handed out has only ~3 of its 7 days left.
    age_request(&env.db.database_url(), &request_id, 5).await;
    let (_, before_quorum) = stored_row(&env.db.database_url(), &request_id).await;
    assert!(
        before_quorum - chrono::Utc::now() < chrono::Duration::days(4),
        "precondition: most of the week is already gone, {before_quorum}"
    );

    // Then the approval lands - which is the instant access actually opens.
    assert_eq!(
        approve(&app, &net.other_token, &request_id).await,
        StatusCode::OK
    );

    let (_, after_quorum) = stored_row(&env.db.database_url(), &request_id).await;
    assert!(
        after_quorum > before_quorum,
        "re-based onto the opening: {after_quorum} should be later than {before_quorum}"
    );
    assert!(
        after_quorum - chrono::Utc::now() > chrono::Duration::days(6),
        "and it is a whole window, not the remainder of one: {after_quorum}"
    );
}

/// A quorum reached before the delay opens at `release_at`, which is what
/// creation measured from - so nothing is re-based.
#[tokio::test]
#[serial_test::serial]
async fn an_early_quorum_keeps_the_window_it_was_given() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;
    let (_, at_creation) = stored_row(&env.db.database_url(), &request_id).await;

    assert_eq!(
        approve(&app, &net.other_token, &request_id).await,
        StatusCode::OK
    );

    let (_, after_quorum) = stored_row(&env.db.database_url(), &request_id).await;
    assert_eq!(after_quorum, at_creation);
}

// ---------------------------------------------------------------------------
// the owner being told
// ---------------------------------------------------------------------------

/// Three accounts see three different things from one request. Mixing them up
/// would hide the veto from the owner, or show the requester a decision they
/// have no business making.
#[tokio::test]
#[serial_test::serial]
async fn each_party_sees_their_own_side_in_the_inbox() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;

    assert_eq!(
        data_access_inbox(&app, &net.owner_token).await,
        vec![(
            "data_access_request_owner".to_string(),
            serde_json::json!(request_id)
        )],
        "the owner is told, and the id is the request's own so the sheet can resolve it"
    );
    assert_eq!(
        data_access_inbox(&app, &net.other_token)
            .await
            .into_iter()
            .map(|(kind, _)| kind)
            .collect::<Vec<_>>(),
        vec!["data_access_request_contact".to_string()],
        "the other contact is asked to approve, not told about a veto"
    );
    assert!(
        data_access_inbox(&app, &net.requester_token)
            .await
            .is_empty(),
        "nobody votes on, or vetoes, their own request"
    );
}

/// Once it is over the sheet must stop being presented.
#[tokio::test]
#[serial_test::serial]
async fn a_closed_request_leaves_the_owners_inbox() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;

    app.request(
        "POST",
        &format!("/data-access/request/{request_id}/refuse"),
        Some(&net.owner_token),
        None,
    )
    .await;

    let (_, body) = app
        .request("GET", "/me/pending-actions", Some(&net.owner_token), None)
        .await;
    assert!(
        !body
            .as_array()
            .expect("a list")
            .iter()
            .any(|action| action["kind"] == "data_access_request_owner"),
        "{body}"
    );
}

// ---------------------------------------------------------------------------
// the requester withdrawing
// ---------------------------------------------------------------------------

/// Withdrawing frees the pair to ask again - otherwise the partial unique
/// index would lock the contact out of a second attempt.
#[tokio::test]
#[serial_test::serial]
async fn the_requester_can_cancel_and_then_ask_again() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;
    assert_eq!(
        approve(&app, &net.other_token, &request_id).await,
        StatusCode::OK
    );

    let (status, body) = app
        .request(
            "POST",
            &format!("/data-access/request/{request_id}/cancel"),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["status"], "cancelled");
    assert_eq!(body["access"], "cancelled");

    fast_forward_release_at(&env.db.database_url(), &request_id).await;
    let (status, _) = shares(&app, &net.requester_token, &request_id).await;
    assert_eq!(
        status,
        StatusCode::LOCKED,
        "a withdrawal outranks the quorum it already had"
    );

    start_request(&app, &net).await;
}

/// Only the requester withdraws, and only once.
#[tokio::test]
#[serial_test::serial]
async fn nobody_but_the_requester_can_cancel() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let request_id = start_request(&app, &net).await;

    for token in [&net.owner_token, &net.other_token] {
        let (status, _) = app
            .request(
                "POST",
                &format!("/data-access/request/{request_id}/cancel"),
                Some(token),
                None,
            )
            .await;
        assert_eq!(status, StatusCode::NOT_FOUND);
    }

    assert_eq!(
        app.request(
            "POST",
            &format!("/data-access/request/{request_id}/cancel"),
            Some(&net.requester_token),
            None,
        )
        .await
        .0,
        StatusCode::OK
    );
    let (status, _) = app
        .request(
            "POST",
            &format!("/data-access/request/{request_id}/cancel"),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "no cancelling twice");
}

// ---------------------------------------------------------------------------
// what a grant actually opens
// ---------------------------------------------------------------------------

/// The point of the whole thing: an open grant lets the contact read the
/// owner's recordings, list and blobs alike.
#[tokio::test]
#[serial_test::serial]
async fn an_open_grant_opens_the_owners_recordings() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let (session, blob) = owner_records_a_session(&app, &net.owner_token).await;
    open_access(&app, env, &net).await;

    let (status, body) = app
        .request(
            "GET",
            &format!("/user/{}/protest-sessions", net.owner_id),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body.as_array().map(|rows| rows.len()), Some(1), "{body}");

    let (status, body) = app
        .request(
            "GET",
            &format!("/protest-session/{session}"),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, bytes) = app
        .request_bytes(
            "GET",
            &format!("/protest-session/{session}/blob/{blob}"),
            &net.requester_token,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(bytes, b"ciphertext", "the ciphertext, unchanged");
}

/// **The test that matters most.** A grant opens reading and nothing else: a
/// contact must never be able to add to, close, or overwrite someone else's
/// recordings. Being able to plant evidence would be worse than not being
/// able to read it.
#[tokio::test]
#[serial_test::serial]
async fn an_open_grant_never_opens_writing() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let (session, _) = owner_records_a_session(&app, &net.owner_token).await;
    open_access(&app, env, &net).await;

    // Overwriting the session, including its sealed key.
    let (status, _) = app
        .request(
            "PUT",
            &format!("/protest-session/{session}"),
            Some(&net.requester_token),
            Some(json!({ "sealedKey": "planted", "metadata": "planted" })),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "a contact must not rewrite a session, and the id must look absent"
    );

    // Closing it.
    let (status, _) = app
        .request(
            "PATCH",
            &format!("/protest-session/{session}"),
            Some(&net.requester_token),
            Some(json!({ "metadata": "planted" })),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    // Adding a blob to it.
    let boundary = "x-test-boundary";
    let mut body = Vec::new();
    for (name, value) in [("kind", "position_batch"), ("seq", "9")] {
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
    body.extend_from_slice(b"planted");
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    let (status, _) = app
        .request_multipart(
            "PUT",
            &format!("/protest-session/{session}/blob/{}", Uuid::new_v4()),
            &net.requester_token,
            boundary,
            body,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

/// A grant is a window. Once it lapses, reading stops with no one having to
/// remember to close it.
#[tokio::test]
#[serial_test::serial]
async fn an_expired_grant_opens_nothing() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    owner_records_a_session(&app, &net.owner_token).await;
    let request_id = open_access(&app, env, &net).await;

    expire_request(&env.db.database_url(), &request_id).await;

    let (_, body) = app
        .request(
            "GET",
            &format!("/data-access/request/{request_id}"),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(body["access"], "expired");

    let (status, _) = shares(&app, &net.requester_token, &request_id).await;
    assert_eq!(status, StatusCode::LOCKED);

    let (status, _) = app
        .request(
            "GET",
            &format!("/user/{}/protest-sessions", net.owner_id),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(
        status,
        StatusCode::NOT_FOUND,
        "an expired grant reads nothing"
    );
}

/// Without a grant, a trusted contact is a stranger to the data - the
/// relationship alone opens nothing.
#[tokio::test]
#[serial_test::serial]
async fn being_a_contact_is_not_enough_to_read() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;
    let net = net_of_two(&app).await;
    let (session, _) = owner_records_a_session(&app, &net.owner_token).await;

    let (status, _) = app
        .request(
            "GET",
            &format!("/user/{}/protest-sessions", net.owner_id),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);

    let (status, _) = app
        .request(
            "GET",
            &format!("/protest-session/{session}"),
            Some(&net.requester_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

// ---------------------------------------------------------------------------
// the single-contact case
// ---------------------------------------------------------------------------

/// The one place the quorum rule bends, and it has to: with a single accepted
/// contact the client sets the Shamir threshold to 1, so that contact already
/// holds the whole DEK sealed to their own device. A quorum of nobody would
/// make the feature unusable while protecting nothing - the owner's veto is
/// then the only gate, which is what the UI has to say out loud.
#[tokio::test]
#[serial_test::serial]
async fn a_lone_contact_needs_no_approval_only_the_delay() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    register_device(&app, &owner_token, "pk-owner", "ios").await;
    let owner_id = app.user_id(&owner_token).await;
    let lone = sign_in_as_accepted_contact(&app, &owner_token, "lone@example.com").await;
    register_device(&app, &lone, "pk-lone", "ios").await;

    let (status, body) = app
        .request(
            "POST",
            &format!("/user/{owner_id}/data-access/requests"),
            Some(&lone),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
    assert_eq!(body["totalContacts"], 0);
    assert_eq!(body["requiredApprovals"], 0);
    let request_id = body["id"].as_str().expect("request id").to_string();

    // Still gated by the delay - that is the whole protection here.
    let (status, _) = shares(&app, &lone, &request_id).await;
    assert_eq!(status, StatusCode::LOCKED);

    fast_forward_release_at(&env.db.database_url(), &request_id).await;
    let (_, body) = app
        .request(
            "GET",
            &format!("/data-access/request/{request_id}"),
            Some(&lone),
            None,
        )
        .await;
    assert_eq!(body["access"], "open");
}

#[tokio::test]
#[serial_test::serial]
async fn data_access_requests_require_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request("POST", "/user/someone/data-access/requests", None, None)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _) = app
        .request(
            "GET",
            &format!("/data-access/request/{}", Uuid::new_v4()),
            None,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
