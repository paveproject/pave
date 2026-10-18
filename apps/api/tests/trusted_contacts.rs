use api_testkit::{
    add_accepted_trusted_contact, fresh_app, register_device, shared_test_env,
    sign_in_as_accepted_contact,
};
use axum::http::StatusCode;
use sea_orm::{ConnectionTrait, Database};
use serde_json::json;

// ---------------------------------------------------------------------------
// generate_invite (GET /me/trusted-contacts/invite)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn generating_an_invite_returns_a_fresh_code() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let (status, invite) = app
        .request("GET", "/me/trusted-contacts/invite", Some(&token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{invite}");
    assert!(invite["id"].is_string());
    assert!(invite["code"].is_string());
    assert!(invite["expiresAt"].is_string());
}

/// At most one unredeemed invite per owner - generating a second one
/// invalidates the first instead of leaving two live codes around.
#[tokio::test]
#[serial_test::serial]
async fn generating_a_second_invite_invalidates_the_first() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let (_, first_invite) = app
        .request(
            "GET",
            "/me/trusted-contacts/invite",
            Some(&owner_token),
            None,
        )
        .await;
    let first_code = first_invite["code"].as_str().unwrap().to_string();

    app.request(
        "GET",
        "/me/trusted-contacts/invite",
        Some(&owner_token),
        None,
    )
    .await;

    let contact_token = app.sign_in("contact@example.com").await;
    let (status, body) = app
        .request(
            "POST",
            "/me/trusted-contacts/redeem",
            Some(&contact_token),
            Some(json!({ "code": first_code })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn generate_invite_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request("GET", "/me/trusted-contacts/invite", None, None)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// redeem_invite (POST /me/trusted-contacts/redeem)
// ---------------------------------------------------------------------------

/// Redeeming is itself the acceptance - no separate pending-then-accept
/// step, see `redeem_invite`'s own doc comment. Checks both sides of the
/// relationship: the owner's "mine" list and the contact's "as-contact"
/// list should each show the other, already `accepted`.
#[tokio::test]
#[serial_test::serial]
async fn redeem_invite_creates_accepted_relationship_both_ways() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_token = app.sign_in("contact@example.com").await;

    add_accepted_trusted_contact(&app, &owner_token, &contact_token).await;

    let (status, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{mine}");
    let mine = mine.as_array().expect("mine response should be an array");
    assert_eq!(mine.len(), 1);
    assert_eq!(mine[0]["status"], "accepted");
    // No username is ever auto-derived from the sign-up email - it stays
    // unset until an explicit `PATCH /me` (see `otp::handle_verify`,
    // which never calls `.with_username(...)`).
    assert!(mine[0]["contact"]["id"].is_string());

    let (status, as_contact) = app
        .request(
            "GET",
            "/me/trusted-contacts/as-contact",
            Some(&contact_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{as_contact}");
    let as_contact = as_contact
        .as_array()
        .expect("as-contact response should be an array");
    assert_eq!(as_contact.len(), 1);
    assert_eq!(as_contact[0]["status"], "accepted");
}

#[tokio::test]
#[serial_test::serial]
async fn redeeming_an_invalid_code_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let contact_token = app.sign_in("contact@example.com").await;
    let (status, _) = app
        .request(
            "POST",
            "/me/trusted-contacts/redeem",
            Some(&contact_token),
            Some(json!({ "code": "NOTACODE" })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
#[serial_test::serial]
async fn redeeming_your_own_code_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let (status, invite) = app
        .request(
            "GET",
            "/me/trusted-contacts/invite",
            Some(&owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{invite}");
    let code = invite["code"]
        .as_str()
        .expect("invite response missing code");

    let (status, _) = app
        .request(
            "POST",
            "/me/trusted-contacts/redeem",
            Some(&owner_token),
            Some(json!({ "code": code })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

/// A code is good for `INVITE_CODE_TTL_HOURS` - nudge its expiry into the
/// past directly in the database (same fast-forward trick as
/// `recovery_requests`'s `releaseAt`) rather than waiting 24h.
#[tokio::test]
#[serial_test::serial]
async fn redeeming_an_expired_code_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let (_, invite) = app
        .request(
            "GET",
            "/me/trusted-contacts/invite",
            Some(&owner_token),
            None,
        )
        .await;
    let invite_id = invite["id"].as_str().unwrap();
    let code = invite["code"].as_str().unwrap().to_string();

    let db = Database::connect(env.db.database_url())
        .await
        .expect("failed to connect to fast-forward invite expiry");
    db.execute_unprepared(&format!(
        "UPDATE trusted_contact SET invite_code_expires_at = now() - interval '1 minute' WHERE id = '{invite_id}'"
    ))
    .await
    .expect("failed to expire invite");

    let contact_token = app.sign_in("contact@example.com").await;
    let (status, body) = app
        .request(
            "POST",
            "/me/trusted-contacts/redeem",
            Some(&contact_token),
            Some(json!({ "code": code })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

/// Redeeming a code that's already been consumed behaves exactly like an
/// invalid one - the row is no longer `pending`, so it just isn't found.
#[tokio::test]
#[serial_test::serial]
async fn redeeming_an_already_redeemed_code_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let (_, invite) = app
        .request(
            "GET",
            "/me/trusted-contacts/invite",
            Some(&owner_token),
            None,
        )
        .await;
    let code = invite["code"].as_str().unwrap().to_string();

    let contact_token = app.sign_in("contact@example.com").await;
    app.request(
        "POST",
        "/me/trusted-contacts/redeem",
        Some(&contact_token),
        Some(json!({ "code": code.clone() })),
    )
    .await;

    let other_token = app.sign_in("other@example.com").await;
    let (status, body) = app
        .request(
            "POST",
            "/me/trusted-contacts/redeem",
            Some(&other_token),
            Some(json!({ "code": code })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

/// Revoke, then re-invite the same person - the previously-revoked row
/// gets revived (back to `accepted`) rather than colliding with the
/// unique `(owner, contact)` constraint or leaving two rows for the same
/// pair. See `redeem_invite`'s own doc comment.
#[tokio::test]
#[serial_test::serial]
async fn re_redeeming_after_a_revoke_revives_the_relationship() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_token = app.sign_in("contact@example.com").await;
    add_accepted_trusted_contact(&app, &owner_token, &contact_token).await;

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let first_relationship_id = mine[0]["id"].as_str().unwrap().to_string();
    app.request(
        "DELETE",
        &format!("/me/trusted-contacts/{first_relationship_id}"),
        Some(&owner_token),
        None,
    )
    .await;

    add_accepted_trusted_contact(&app, &owner_token, &contact_token).await;

    let (status, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{mine}");
    let mine = mine.as_array().expect("should be an array");
    // Revived in place, not a second row for the same pair.
    assert_eq!(mine.len(), 1);
    assert_eq!(mine[0]["id"], first_relationship_id);
    assert_eq!(mine[0]["status"], "accepted");
}

#[tokio::test]
#[serial_test::serial]
async fn redeem_invite_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "POST",
            "/me/trusted-contacts/redeem",
            None,
            Some(json!({ "code": "AAAAAAAA" })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// list_trusted_contacts (GET /me/trusted-contacts) - the owner's "mine" list
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn mine_shows_a_still_pending_unredeemed_invite() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    app.request(
        "GET",
        "/me/trusted-contacts/invite",
        Some(&owner_token),
        None,
    )
    .await;

    let (status, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{mine}");
    let mine = mine.as_array().expect("should be an array");
    assert_eq!(mine.len(), 1);
    assert_eq!(mine[0]["status"], "pending");
    assert!(mine[0]["contact"].is_null());
}

#[tokio::test]
#[serial_test::serial]
async fn mine_still_shows_a_revoked_contact() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_token = app.sign_in("contact@example.com").await;
    add_accepted_trusted_contact(&app, &owner_token, &contact_token).await;

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let relationship_id = mine[0]["id"].as_str().unwrap().to_string();
    app.request(
        "DELETE",
        &format!("/me/trusted-contacts/{relationship_id}"),
        Some(&owner_token),
        None,
    )
    .await;

    let (status, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{mine}");
    let mine = mine.as_array().expect("should be an array");
    assert_eq!(mine.len(), 1, "a revoked relationship is kept, not deleted");
    assert_eq!(mine[0]["status"], "revoked");
}

#[tokio::test]
#[serial_test::serial]
async fn mine_never_shows_another_owners_contacts() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_a = app.sign_in("owner-a@example.com").await;
    let owner_b = app.sign_in("owner-b@example.com").await;
    let contact_token = app.sign_in("contact@example.com").await;
    add_accepted_trusted_contact(&app, &owner_a, &contact_token).await;

    let (status, mine_b) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_b), None)
        .await;
    assert_eq!(status, StatusCode::OK, "{mine_b}");
    assert_eq!(mine_b.as_array().expect("should be an array").len(), 0);
}

#[tokio::test]
#[serial_test::serial]
async fn list_trusted_contacts_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app.request("GET", "/me/trusted-contacts", None, None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// list_as_contact (GET /me/trusted-contacts/as-contact)
// ---------------------------------------------------------------------------

/// Unlike "mine", `as-contact` only ever shows `accepted` relationships -
/// once revoked, the owner disappears from the contact's own list
/// entirely rather than lingering with a `revoked` status.
#[tokio::test]
#[serial_test::serial]
async fn as_contact_drops_a_revoked_relationship_entirely() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_token = app.sign_in("contact@example.com").await;
    add_accepted_trusted_contact(&app, &owner_token, &contact_token).await;

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let relationship_id = mine[0]["id"].as_str().unwrap().to_string();
    app.request(
        "DELETE",
        &format!("/me/trusted-contacts/{relationship_id}"),
        Some(&owner_token),
        None,
    )
    .await;

    let (status, as_contact) = app
        .request(
            "GET",
            "/me/trusted-contacts/as-contact",
            Some(&contact_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{as_contact}");
    assert_eq!(as_contact.as_array().expect("should be an array").len(), 0);
}

/// Without a `deviceId` query param, `encryptedShare` resolves to
/// nothing even once a share genuinely exists - it's always scoped to
/// one specific device.
#[tokio::test]
#[serial_test::serial]
async fn as_contact_resolves_the_encrypted_share_only_for_the_queried_device() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_token =
        sign_in_as_accepted_contact(&app, &owner_token, "contact@example.com").await;
    let contact_device = register_device(&app, &contact_token, "pk-contact-d1", "ios").await;
    let contact_device_id = contact_device["id"].as_str().unwrap();

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let trusted_contact_id = mine[0]["id"].as_str().unwrap();

    let (status, body) = app
        .request(
            "PUT",
            "/me/trusted-contacts/shares",
            Some(&owner_token),
            Some(json!({ "shares": [{
                "trustedContactId": trusted_contact_id,
                "deviceId": contact_device_id,
                "encryptedShare": "test-share-blob",
            }] })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");

    let (status, no_device) = app
        .request(
            "GET",
            "/me/trusted-contacts/as-contact",
            Some(&contact_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{no_device}");
    assert!(no_device[0]["encryptedShare"].is_null());

    let (status, with_device) = app
        .request(
            "GET",
            &format!("/me/trusted-contacts/as-contact?deviceId={contact_device_id}"),
            Some(&contact_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{with_device}");
    assert_eq!(with_device[0]["encryptedShare"], "test-share-blob");
}

#[tokio::test]
#[serial_test::serial]
async fn as_contact_never_shows_another_persons_relationships() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_a = app.sign_in("contact-a@example.com").await;
    let contact_b = app.sign_in("contact-b@example.com").await;
    add_accepted_trusted_contact(&app, &owner_token, &contact_a).await;

    let (status, as_contact_b) = app
        .request(
            "GET",
            "/me/trusted-contacts/as-contact",
            Some(&contact_b),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{as_contact_b}");
    assert_eq!(
        as_contact_b.as_array().expect("should be an array").len(),
        0
    );
}

// ---------------------------------------------------------------------------
// revoke_trusted_contact (DELETE /me/trusted-contacts/{id})
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn owner_can_revoke_an_accepted_contact() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_token = app.sign_in("contact@example.com").await;
    add_accepted_trusted_contact(&app, &owner_token, &contact_token).await;

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let relationship_id = mine[0]["id"].as_str().unwrap();

    let (status, _) = app
        .request(
            "DELETE",
            &format!("/me/trusted-contacts/{relationship_id}"),
            Some(&owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
}

/// A still-unredeemed invite can be revoked too - no contact to notify,
/// but it shouldn't crash or otherwise fail.
#[tokio::test]
#[serial_test::serial]
async fn owner_can_revoke_a_still_pending_invite() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let (_, invite) = app
        .request(
            "GET",
            "/me/trusted-contacts/invite",
            Some(&owner_token),
            None,
        )
        .await;
    let invite_id = invite["id"].as_str().unwrap();

    let (status, _) = app
        .request(
            "DELETE",
            &format!("/me/trusted-contacts/{invite_id}"),
            Some(&owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
#[serial_test::serial]
async fn revoking_a_nonexistent_relationship_is_not_found() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let (status, _) = app
        .request(
            "DELETE",
            "/me/trusted-contacts/00000000-0000-0000-0000-000000000000",
            Some(&owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

/// The *contact* side has no standing to revoke a relationship - only the
/// owner who created it can.
#[tokio::test]
#[serial_test::serial]
async fn the_contact_cannot_revoke_the_relationship_themselves() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_token = app.sign_in("contact@example.com").await;
    add_accepted_trusted_contact(&app, &owner_token, &contact_token).await;

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let relationship_id = mine[0]["id"].as_str().unwrap();

    let (status, body) = app
        .request(
            "DELETE",
            &format!("/me/trusted-contacts/{relationship_id}"),
            Some(&contact_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::NOT_FOUND, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn revoking_a_malformed_id_is_a_bad_request() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let (status, _) = app
        .request(
            "DELETE",
            "/me/trusted-contacts/not-a-uuid",
            Some(&owner_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
#[serial_test::serial]
async fn revoke_trusted_contact_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "DELETE",
            "/me/trusted-contacts/00000000-0000-0000-0000-000000000000",
            None,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

// ---------------------------------------------------------------------------
// set_shares (PUT /me/trusted-contacts/shares)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn set_shares_deposits_a_sealed_copy_for_the_contacts_device() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_token =
        sign_in_as_accepted_contact(&app, &owner_token, "contact@example.com").await;
    let contact_device = register_device(&app, &contact_token, "pk-contact-d1", "ios").await;

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let trusted_contact_id = mine[0]["id"].as_str().unwrap();

    let (status, body) = app
        .request(
            "PUT",
            "/me/trusted-contacts/shares",
            Some(&owner_token),
            Some(json!({ "shares": [{
                "trustedContactId": trusted_contact_id,
                "deviceId": contact_device["id"],
                "encryptedShare": "test-share-blob",
            }] })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{body}");
}

/// Re-uploading for the same `(trustedContact, device)` pair updates the
/// existing row rather than creating a second one.
#[tokio::test]
#[serial_test::serial]
async fn set_shares_updates_an_existing_share_in_place() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_token =
        sign_in_as_accepted_contact(&app, &owner_token, "contact@example.com").await;
    let contact_device = register_device(&app, &contact_token, "pk-contact-d1", "ios").await;

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let trusted_contact_id = mine[0]["id"].as_str().unwrap().to_string();
    let device_id = contact_device["id"].as_str().unwrap().to_string();

    for blob in ["first-blob", "second-blob"] {
        let (status, body) = app
            .request(
                "PUT",
                "/me/trusted-contacts/shares",
                Some(&owner_token),
                Some(json!({ "shares": [{
                    "trustedContactId": trusted_contact_id,
                    "deviceId": device_id,
                    "encryptedShare": blob,
                }] })),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{body}");
    }

    let (status, as_contact) = app
        .request(
            "GET",
            &format!("/me/trusted-contacts/as-contact?deviceId={device_id}"),
            Some(&contact_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{as_contact}");
    assert_eq!(as_contact.as_array().expect("should be an array").len(), 1);
    assert_eq!(as_contact[0]["encryptedShare"], "second-blob");
}

#[tokio::test]
#[serial_test::serial]
async fn set_shares_rejects_a_trusted_contact_id_you_dont_own() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_a = app.sign_in("owner-a@example.com").await;
    let contact_a = sign_in_as_accepted_contact(&app, &owner_a, "contact-a@example.com").await;
    let device_a = register_device(&app, &contact_a, "pk-a1", "ios").await;

    let (_, mine_a) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_a), None)
        .await;
    let relationship_a = mine_a[0]["id"].as_str().unwrap();

    // A different owner tries to upload a share against owner A's
    // relationship id.
    let owner_b = app.sign_in("owner-b@example.com").await;
    let (status, body) = app
        .request(
            "PUT",
            "/me/trusted-contacts/shares",
            Some(&owner_b),
            Some(json!({ "shares": [{
                "trustedContactId": relationship_a,
                "deviceId": device_a["id"],
                "encryptedShare": "test-share-blob",
            }] })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn set_shares_rejects_a_nonexistent_device_id() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let _contact_token =
        sign_in_as_accepted_contact(&app, &owner_token, "contact@example.com").await;

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let trusted_contact_id = mine[0]["id"].as_str().unwrap();

    let (status, body) = app
        .request(
            "PUT",
            "/me/trusted-contacts/shares",
            Some(&owner_token),
            Some(json!({ "shares": [{
                "trustedContactId": trusted_contact_id,
                "deviceId": "00000000-0000-0000-0000-000000000000",
                "encryptedShare": "test-share-blob",
            }] })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

/// The device id is real, but belongs to someone other than that
/// specific contact (here: the owner's own device) - still rejected.
#[tokio::test]
#[serial_test::serial]
async fn set_shares_rejects_a_device_belonging_to_someone_else() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let owner_device = register_device(&app, &owner_token, "pk-owner-d1", "ios").await;
    let _contact_token =
        sign_in_as_accepted_contact(&app, &owner_token, "contact@example.com").await;

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let trusted_contact_id = mine[0]["id"].as_str().unwrap();

    let (status, body) = app
        .request(
            "PUT",
            "/me/trusted-contacts/shares",
            Some(&owner_token),
            Some(json!({ "shares": [{
                "trustedContactId": trusted_contact_id,
                "deviceId": owner_device["id"],
                "encryptedShare": "test-share-blob",
            }] })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

/// Validation runs over the *whole* batch before anything is written -
/// one bad entry must not let the good ones through either.
#[tokio::test]
#[serial_test::serial]
async fn set_shares_rejects_the_whole_batch_if_one_entry_is_invalid() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let contact_token =
        sign_in_as_accepted_contact(&app, &owner_token, "contact@example.com").await;
    let contact_device = register_device(&app, &contact_token, "pk-contact-d1", "ios").await;

    let (_, mine) = app
        .request("GET", "/me/trusted-contacts", Some(&owner_token), None)
        .await;
    let trusted_contact_id = mine[0]["id"].as_str().unwrap().to_string();

    let (status, body) = app
        .request(
            "PUT",
            "/me/trusted-contacts/shares",
            Some(&owner_token),
            Some(json!({ "shares": [
                {
                    "trustedContactId": trusted_contact_id,
                    "deviceId": contact_device["id"],
                    "encryptedShare": "good-blob",
                },
                {
                    "trustedContactId": "00000000-0000-0000-0000-000000000000",
                    "deviceId": contact_device["id"],
                    "encryptedShare": "bad-blob",
                },
            ] })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");

    let device_id = contact_device["id"].as_str().unwrap();
    let (status, as_contact) = app
        .request(
            "GET",
            &format!("/me/trusted-contacts/as-contact?deviceId={device_id}"),
            Some(&contact_token),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{as_contact}");
    assert!(
        as_contact[0]["encryptedShare"].is_null(),
        "the valid entry must not have been written when the batch as a whole was rejected"
    );
}

#[tokio::test]
#[serial_test::serial]
async fn set_shares_rejects_malformed_ids() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let owner_token = app.sign_in("owner@example.com").await;
    let (status, body) = app
        .request(
            "PUT",
            "/me/trusted-contacts/shares",
            Some(&owner_token),
            Some(json!({ "shares": [{
                "trustedContactId": "not-a-uuid",
                "deviceId": "also-not-a-uuid",
                "encryptedShare": "blob",
            }] })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{body}");
}

#[tokio::test]
#[serial_test::serial]
async fn set_shares_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "PUT",
            "/me/trusted-contacts/shares",
            None,
            Some(json!({ "shares": [] })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}
