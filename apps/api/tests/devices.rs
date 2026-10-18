use api_testkit::{
    fresh_app, register_device, shared_test_env, sign_in_with_two_devices, TwoDevices,
};
use axum::http::StatusCode;
use serde_json::json;

// ---------------------------------------------------------------------------
// set_device (PUT /me/devices) - bootstrapping
// ---------------------------------------------------------------------------

/// `account_has_protected_state`'s own doc comment: a genuinely first
/// device has nothing to protect yet, so it skips approval entirely.
#[tokio::test]
#[serial_test::serial]
async fn first_device_bootstraps_active() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let device = register_device(&app, &token, "pk-d1", "ios").await;

    assert_eq!(device["status"], "active");
    assert_eq!(device["deviceType"], "ios");
}

/// Once the account already has one device, a second one has something
/// to protect - it comes back `pending` until an already-`active`
/// sibling approves it.
#[tokio::test]
#[serial_test::serial]
async fn second_device_requires_approval() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;
    // `sign_in_with_two_devices` already asserts both statuses - this test
    // exists to name that behavior explicitly, not just as a side effect
    // of a shared helper.
    assert_ne!(devices.active_device_id, devices.pending_device_id);
}

/// Re-registering the same public key updates the existing row in place
/// (new session id, refreshed `updatedAt`) instead of minting a second
/// device - `set_device` upserts by `(user_id, public_key)`, not by
/// session.
#[tokio::test]
#[serial_test::serial]
async fn re_registering_the_same_public_key_updates_in_place() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token1 = app.sign_in("owner@example.com").await;
    let device1 = register_device(&app, &token1, "pk-d1", "ios").await;

    // A later re-launch, same device, new session.
    let token2 = app.sign_in("owner@example.com").await;
    let device2 = register_device(&app, &token2, "pk-d1", "ios").await;

    assert_eq!(device1["id"], device2["id"]);

    let (status, list) = app.request("GET", "/me/devices", Some(&token2), None).await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert_eq!(
        list.as_array().expect("list should be an array").len(),
        1,
        "re-registering the same public key must not create a second row"
    );
}

// ---------------------------------------------------------------------------
// list_devices (GET /me/devices)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn list_devices_is_empty_for_a_fresh_account() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (status, list) = app.request("GET", "/me/devices", Some(&token), None).await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert_eq!(list.as_array().expect("should be an array").len(), 0);
}

#[tokio::test]
#[serial_test::serial]
async fn list_devices_orders_newest_first() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let (status, list) = app
        .request("GET", "/me/devices", Some(&devices.active_token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{list}");
    let list = list.as_array().expect("should be an array");
    assert_eq!(list.len(), 2);
    // The second device registered should come back first.
    assert_eq!(list[0]["id"], devices.pending_device_id);
    assert_eq!(list[1]["id"], devices.active_device_id);
}

/// One account's device list must never leak another account's rows -
/// the exact kind of cross-account bug this session already found once
/// in the mobile client's local storage.
#[tokio::test]
#[serial_test::serial]
async fn list_devices_never_shows_another_accounts_devices() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token_a = app.sign_in("owner-a@example.com").await;
    register_device(&app, &token_a, "pk-a1", "ios").await;

    let token_b = app.sign_in("owner-b@example.com").await;
    register_device(&app, &token_b, "pk-b1", "android").await;

    let (status, list_a) = app
        .request("GET", "/me/devices", Some(&token_a), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{list_a}");
    let list_a = list_a.as_array().expect("should be an array");
    assert_eq!(list_a.len(), 1);
    assert_eq!(list_a[0]["publicKey"], "pk-a1");
}

// ---------------------------------------------------------------------------
// approve_device (POST /me/devices/{id}/approve)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn active_sibling_can_approve_a_pending_device() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let (status, approved) = app
        .request(
            "POST",
            &format!("/me/devices/{}/approve", devices.pending_device_id),
            Some(&devices.active_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{approved}");
    assert_eq!(approved["status"], "active");
    // No remaining security reason to keep a resolved device's location -
    // see `approve_device`'s own doc comment.
    assert!(approved["locationCity"].is_null());
    assert!(approved["locationCountry"].is_null());
}

/// A still-`pending` device has no standing to approve anyone, including
/// itself - `resolve_active_caller_device` requires the caller to
/// already be `active`.
#[tokio::test]
#[serial_test::serial]
async fn a_pending_device_cannot_approve_anyone() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let (status, body) = app
        .request(
            "POST",
            &format!("/me/devices/{}/approve", devices.pending_device_id),
            Some(&devices.pending_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn approving_an_already_active_device_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    // The caller's own device is already active - not a pending row.
    let (status, body) = app
        .request(
            "POST",
            &format!("/me/devices/{}/approve", devices.active_device_id),
            Some(&devices.active_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn approving_a_nonexistent_device_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let (status, body) = app
        .request(
            "POST",
            "/me/devices/00000000-0000-0000-0000-000000000000/approve",
            Some(&devices.active_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

/// Can't approve a *malformed* id either - `Path<Uuid>` rejects it before
/// the handler ever runs.
#[tokio::test]
#[serial_test::serial]
async fn approving_a_malformed_device_id_is_a_bad_request() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let (status, body) = app
        .request(
            "POST",
            "/me/devices/not-a-uuid/approve",
            Some(&devices.active_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

/// An active device belonging to a *different* account has no standing
/// over this one's pending device, even though it's genuinely active.
#[tokio::test]
#[serial_test::serial]
async fn approving_another_accounts_device_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let other_token = app.sign_in("stranger@example.com").await;
    register_device(&app, &other_token, "pk-stranger", "ios").await;

    let (status, body) = app
        .request(
            "POST",
            &format!("/me/devices/{}/approve", devices.pending_device_id),
            Some(&other_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

// ---------------------------------------------------------------------------
// decline_device (POST /me/devices/{id}/decline)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn active_sibling_can_decline_a_pending_device() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let (status, declined) = app
        .request(
            "POST",
            &format!("/me/devices/{}/decline", devices.pending_device_id),
            Some(&devices.active_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{declined}");
    assert_eq!(declined["id"], devices.pending_device_id);

    // The row is gone, not just flagged.
    let (status, list) = app
        .request("GET", "/me/devices", Some(&devices.active_token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert_eq!(list.as_array().expect("should be an array").len(), 1);
}

#[tokio::test]
#[serial_test::serial]
async fn a_pending_device_cannot_decline_anyone() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let (status, body) = app
        .request(
            "POST",
            &format!("/me/devices/{}/decline", devices.pending_device_id),
            Some(&devices.pending_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn declining_an_already_resolved_device_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let (status, approved) = app
        .request(
            "POST",
            &format!("/me/devices/{}/approve", devices.pending_device_id),
            Some(&devices.active_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{approved}");

    // Already active now - no longer a pending row to decline.
    let (status, body) = app
        .request(
            "POST",
            &format!("/me/devices/{}/decline", devices.pending_device_id),
            Some(&devices.active_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn declining_another_accounts_device_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let other_token = app.sign_in("stranger@example.com").await;
    register_device(&app, &other_token, "pk-stranger", "ios").await;

    let (status, body) = app
        .request(
            "POST",
            &format!("/me/devices/{}/decline", devices.pending_device_id),
            Some(&other_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

// ---------------------------------------------------------------------------
// revoke_device (DELETE /me/devices/{id})
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn active_sibling_can_revoke_another_device() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;
    app.request(
        "POST",
        &format!("/me/devices/{}/approve", devices.pending_device_id),
        Some(&devices.active_token),
        None,
    )
    .await;

    let (status, _) = app
        .request(
            "DELETE",
            &format!("/me/devices/{}", devices.pending_device_id),
            Some(&devices.active_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);

    let (status, list) = app
        .request("GET", "/me/devices", Some(&devices.active_token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{list}");
    assert_eq!(list.as_array().expect("should be an array").len(), 1);
}

/// A device can never revoke *itself* - see `revoke_device`'s own doc
/// comment on why that's what makes "zero active devices left" structurally
/// impossible through this endpoint.
#[tokio::test]
#[serial_test::serial]
async fn a_device_cannot_revoke_itself() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let device = register_device(&app, &token, "pk-d1", "ios").await;
    let device_id = device["id"].as_str().expect("missing id");

    let (status, body) = app
        .request(
            "DELETE",
            &format!("/me/devices/{device_id}"),
            Some(&token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn a_pending_device_cannot_revoke_anyone() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let TwoDevices {
        active_device_id,
        pending_token,
        ..
    } = sign_in_with_two_devices(&app, "owner@example.com").await;

    let (status, body) = app
        .request(
            "DELETE",
            &format!("/me/devices/{active_device_id}"),
            Some(&pending_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::FORBIDDEN, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn revoking_a_nonexistent_device_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    register_device(&app, &token, "pk-d1", "ios").await;

    let (status, body) = app
        .request(
            "DELETE",
            "/me/devices/00000000-0000-0000-0000-000000000000",
            Some(&token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn revoking_another_accounts_device_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let other_token = app.sign_in("stranger@example.com").await;
    register_device(&app, &other_token, "pk-stranger", "ios").await;

    let (status, body) = app
        .request(
            "DELETE",
            &format!("/me/devices/{}", devices.pending_device_id),
            Some(&other_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

// ---------------------------------------------------------------------------
// set_device_dek (PUT /me/devices/{id}/dek)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn set_device_dek_deposits_a_sealed_copy() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let (status, updated) = app
        .request(
            "PUT",
            &format!("/me/devices/{}/dek", devices.pending_device_id),
            Some(&devices.active_token),
            Some(json!({ "encryptedDek": "test-sealed-dek-blob" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{updated}");
    assert_eq!(updated["encryptedDek"], "test-sealed-dek-blob");
}

#[tokio::test]
#[serial_test::serial]
async fn set_device_dek_on_a_nonexistent_device_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    register_device(&app, &token, "pk-d1", "ios").await;

    let (status, body) = app
        .request(
            "PUT",
            "/me/devices/00000000-0000-0000-0000-000000000000/dek",
            Some(&token),
            Some(json!({ "encryptedDek": "test-sealed-dek-blob" })),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

/// `set_device_dek` only checks `user_id`, not an active/pending split -
/// but it still must never touch a device belonging to someone else.
#[tokio::test]
#[serial_test::serial]
async fn set_device_dek_on_another_accounts_device_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let devices = sign_in_with_two_devices(&app, "owner@example.com").await;

    let other_token = app.sign_in("stranger@example.com").await;
    register_device(&app, &other_token, "pk-stranger", "ios").await;

    let (status, body) = app
        .request(
            "PUT",
            &format!("/me/devices/{}/dek", devices.pending_device_id),
            Some(&other_token),
            Some(json!({ "encryptedDek": "test-sealed-dek-blob" })),
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

// ---------------------------------------------------------------------------
// Every device endpoint, unauthenticated
// ---------------------------------------------------------------------------

/// No bearer token at all - every device endpoint sits behind
/// `CurrentSession`, which rejects before any handler logic runs.
#[tokio::test]
#[serial_test::serial]
async fn device_endpoints_require_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app.request("GET", "/me/devices", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _) = app
        .request(
            "PUT",
            "/me/devices",
            None,
            Some(json!({ "publicKey": "pk", "deviceType": "ios" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);

    let (status, _) = app
        .request(
            "DELETE",
            "/me/devices/00000000-0000-0000-0000-000000000000",
            None,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

/// A garbage/expired bearer token is rejected the same way - not
/// confused with "no token at all".
#[tokio::test]
#[serial_test::serial]
async fn device_endpoints_reject_an_invalid_token() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request("GET", "/me/devices", Some("not-a-real-session-token"), None)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
