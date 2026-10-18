use api_testkit::{fresh_app, shared_test_env, APP_STORE_CONNECT_WEBHOOK_SECRET};
use axum::http::StatusCode;
use hmac::{Hmac, Mac};
use sha2::Sha256;

fn sign(secret: &str, body: &[u8]) -> String {
    let mut mac = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).unwrap();
    mac.update(body);
    format!("hmacsha256={}", hex::encode(mac.finalize().into_bytes()))
}

// ---------------------------------------------------------------------------
// handle_webhook (POST /webhooks/app-store-connect)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn webhook_without_a_signature_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let body = br#"{"data":{"type":"test"}}"#.to_vec();
    let (status, _) = app
        .request_raw("POST", "/webhooks/app-store-connect", &[], body)
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
#[serial_test::serial]
async fn webhook_with_a_wrong_signature_is_rejected() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let body = br#"{"data":{"type":"test"}}"#.to_vec();
    let bad_signature = sign("not-the-real-secret", &body);
    let (status, _) = app
        .request_raw(
            "POST",
            "/webhooks/app-store-connect",
            &[("x-apple-signature", &bad_signature)],
            body,
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

/// A correctly signed, well-formed event the service doesn't act on
/// (anything other than `appStoreVersionAppVersionStateUpdated`) is still
/// acked with 200 - Apple must not retry-loop a delivery we understood
/// fine but had nothing to do with.
#[tokio::test]
#[serial_test::serial]
async fn webhook_with_a_valid_signature_and_unrecognized_event_is_acked() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let body = br#"{"data":{"type":"someOtherEventType"}}"#.to_vec();
    let signature = sign(APP_STORE_CONNECT_WEBHOOK_SECRET, &body);
    let (status, _) = app
        .request_raw(
            "POST",
            "/webhooks/app-store-connect",
            &[("x-apple-signature", &signature)],
            body,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
}

/// Verified but not valid JSON - acked anyway rather than making Apple
/// retry a delivery that can never parse (see `handle_webhook`'s own doc
/// comment); this can't happen from the real Apple, but shouldn't panic.
#[tokio::test]
#[serial_test::serial]
async fn webhook_with_a_valid_signature_but_malformed_body_is_still_acked() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let body = b"not json at all".to_vec();
    let signature = sign(APP_STORE_CONNECT_WEBHOOK_SECRET, &body);
    let (status, _) = app
        .request_raw(
            "POST",
            "/webhooks/app-store-connect",
            &[("x-apple-signature", &signature)],
            body,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
}

/// A recognized event type with a non-`READY_FOR_DISTRIBUTION` state
/// change is ignored (not acted on) but still acked.
#[tokio::test]
#[serial_test::serial]
async fn webhook_ignores_a_non_live_state_transition() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let body = br#"{
        "data": {
            "type": "appStoreVersionAppVersionStateUpdated",
            "attributes": { "newValue": "IN_REVIEW" },
            "relationships": { "instance": { "data": { "id": "v1" } } }
        }
    }"#
    .to_vec();
    let signature = sign(APP_STORE_CONNECT_WEBHOOK_SECRET, &body);
    let (status, _) = app
        .request_raw(
            "POST",
            "/webhooks/app-store-connect",
            &[("x-apple-signature", &signature)],
            body,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
}
