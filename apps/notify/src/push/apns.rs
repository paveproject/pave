//! Apple Push Notification service, via the `a2` crate (HTTP/2, token-based
//! auth) - unlike FCM, hand-rolling HTTP/2 well is enough work that a
//! mature, widely-used crate is worth the dependency here.
use a2::request::notification::{
    DefaultNotificationBuilder, NotificationBuilder, NotificationOptions,
};
use a2::{Client, ClientConfig, Endpoint};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use std::io::Cursor;

/// `None` if `key_b64` doesn't decode/parse into a usable key - logged, not
/// panicked, same "ship before credentials exist" reasoning as
/// `AppStoreConnectClient`. The `.p8` key's PEM content is base64-encoded in
/// `APNS_KEY_B64` to dodge the multiline-env-var problem (same key, just a
/// different encoding convention than `APP_STORE_CONNECT_PRIVATE_KEY`'s
/// `\n`-escaping - see `config.rs`).
pub fn build_client(
    key_b64: &str,
    key_id: &str,
    team_id: &str,
    production: bool,
) -> Option<Client> {
    let key_pem = BASE64
        .decode(key_b64.trim())
        .inspect_err(|err| tracing::error!(%err, "APNS_KEY_B64 is not valid base64"))
        .ok()?;

    let endpoint = if production {
        Endpoint::Production
    } else {
        Endpoint::Sandbox
    };
    let mut reader = Cursor::new(key_pem);
    Client::token(&mut reader, key_id, team_id, ClientConfig::new(endpoint))
        .inspect_err(|err| tracing::error!(%err, "invalid APNs key/credentials"))
        .ok()
}

pub async fn send(
    client: &Client,
    topic: &str,
    device_token: &str,
    title: &str,
    body: &str,
    data: &serde_json::Value,
) -> Result<(), String> {
    let mut payload = DefaultNotificationBuilder::new()
        .set_title(title)
        .set_body(body)
        .build(
            device_token,
            NotificationOptions {
                apns_topic: Some(topic),
                ..Default::default()
            },
        );

    if !data.is_null() {
        payload
            .add_custom_data("data", data)
            .map_err(|err| format!("failed to attach APNs custom data: {err}"))?;
    }

    client
        .send(payload)
        .await
        .map_err(|err| format!("APNs send failed: {err}"))?;

    Ok(())
}
