//! Multi-step setup shared by many tests across different endpoints -
//! e.g. almost every `recovery_requests`/`trusted_contacts` test needs an
//! already-accepted trusted contact in place first, same as almost every
//! `devices` test past the very first one needs an already-registered
//! device. Keeping these here (instead of copy-pasted per test file)
//! means a change to *how* a device gets registered only has to happen
//! once.

use crate::app::TestApp;
use axum::http::StatusCode;
use serde_json::{json, Value};

/// Registers a device for the given (already signed-in) session and
/// returns the full `MeDevicesResponse` JSON - asserts the call itself
/// succeeded, but never the resulting `status` (bootstraps `active` or
/// `pending` depending on what the account already has - that's the
/// caller's own thing to assert).
pub async fn register_device(
    app: &TestApp,
    token: &str,
    public_key: &str,
    device_type: &str,
) -> Value {
    let (status, device) = app
        .request(
            "PUT",
            "/me/devices",
            Some(token),
            Some(json!({ "publicKey": public_key, "deviceType": device_type })),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "failed to register device: {device}"
    );
    device
}

/// The shape almost every `devices` test past registration itself needs:
/// one account, two sessions, the first device already `active` (nothing
/// to protect when it registered), the second `pending` (the first
/// already existed by then).
pub struct TwoDevices {
    pub active_token: String,
    pub active_device_id: String,
    pub pending_token: String,
    pub pending_device_id: String,
}

pub async fn sign_in_with_two_devices(app: &TestApp, email: &str) -> TwoDevices {
    let active_token = app.sign_in(email).await;
    let active_device = register_device(app, &active_token, "pk-d1", "ios").await;
    assert_eq!(active_device["status"], "active");

    let pending_token = app.sign_in(email).await;
    let pending_device = register_device(app, &pending_token, "pk-d2", "android").await;
    assert_eq!(pending_device["status"], "pending");

    TwoDevices {
        active_token,
        active_device_id: active_device["id"]
            .as_str()
            .expect("device response missing id")
            .to_string(),
        pending_token,
        pending_device_id: pending_device["id"]
            .as_str()
            .expect("device response missing id")
            .to_string(),
    }
}

/// Generates an invite from the owner's session and redeems it from the
/// contact's session - the real two-call dance `settings/trusted-contact/add.tsx`
/// does, ending with an `accepted` `trusted_contact` row (redeeming is
/// itself the acceptance, no separate approval step - see
/// `redeem_invite`'s own doc comment).
pub async fn add_accepted_trusted_contact(app: &TestApp, owner_token: &str, contact_token: &str) {
    let (status, invite) = app
        .request(
            "GET",
            "/me/trusted-contacts/invite",
            Some(owner_token),
            None,
        )
        .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "failed to generate invite: {invite}"
    );
    let code = invite["code"]
        .as_str()
        .expect("invite response missing code");

    let (status, redeemed) = app
        .request(
            "POST",
            "/me/trusted-contacts/redeem",
            Some(contact_token),
            Some(json!({ "code": code })),
        )
        .await;
    assert_eq!(
        status,
        StatusCode::OK,
        "failed to redeem invite: {redeemed}"
    );
}

/// Signs a fresh session in for `email` and makes it an accepted trusted
/// contact of `owner_token` in one call - the common case where the test
/// doesn't care about the invite/redeem mechanics themselves, just that
/// the relationship exists.
pub async fn sign_in_as_accepted_contact(app: &TestApp, owner_token: &str, email: &str) -> String {
    let contact_token = app.sign_in(email).await;
    add_accepted_trusted_contact(app, owner_token, &contact_token).await;
    contact_token
}

/// The shape almost every `recovery_requests` test needs: an owner whose
/// *current* session's device is `pending` (so it can call
/// `POST /me/recovery-requests`), with `contact_emails.len()` already-
/// accepted trusted contacts in place first. Mirrors the real sequence a
/// device actually goes through - register a first (active) device,
/// accept some contacts, *then* register the second (pending) one, since
/// `account_has_protected_state` is what makes it pending in the first
/// place.
pub struct RecoverySetup {
    /// The pending device's own session - this is the one standing to
    /// call `create_recovery_request`.
    pub owner_token: String,
    /// One token per `contact_emails` entry, same order.
    pub contact_tokens: Vec<String>,
}

pub async fn setup_recovery_scenario(
    app: &TestApp,
    owner_email: &str,
    contact_emails: &[&str],
) -> RecoverySetup {
    let owner_active_token = app.sign_in(owner_email).await;
    register_device(app, &owner_active_token, "pk-owner-d1", "ios").await;

    let mut contact_tokens = Vec::with_capacity(contact_emails.len());
    for email in contact_emails {
        contact_tokens.push(sign_in_as_accepted_contact(app, &owner_active_token, email).await);
    }

    let owner_token = app.sign_in(owner_email).await;
    let pending_device = register_device(app, &owner_token, "pk-owner-d2", "android").await;
    assert_eq!(pending_device["status"], "pending");

    RecoverySetup {
        owner_token,
        contact_tokens,
    }
}
