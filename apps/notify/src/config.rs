use serde::Deserialize;

/// Everything `notify` reads from the environment, loaded once in `main`
/// and threaded through from there - no `std::env::var` anywhere else in
/// this crate. Redis is shared with `apps/api` (see `env_rs::RedisConfig`),
/// loaded separately since it's not part of this struct's own shape.
#[derive(Debug, Clone, Deserialize)]
pub struct NotifyConfig {
    pub resend_api_key: String,
    #[serde(default = "default_from_email")]
    pub resend_from_email: String,
    /// Missing in dev is fine (local RustFS still serves images, just not
    /// reachable from wherever you're previewing the email) - missing in
    /// prod means every email goes out with a broken logo, so `main`
    /// warns once at boot instead of failing per-email silently.
    pub assets_base_url: Option<String>,

    /// The three below back `push::fcm` - all `None` until FCM is actually
    /// set up. `fcm_private_key_b64` is the service account's private key,
    /// base64-encoded (same convention as `apns_key_b64`) - `project_id`/
    /// `client_email` need no such encoding, they're plain single-line
    /// strings already.
    pub fcm_project_id: Option<String>,
    pub fcm_client_email: Option<String>,
    pub fcm_private_key_b64: Option<String>,

    /// The four below back `push::apns` - all `None` until APNs is set up.
    /// `apns_key_b64` is the `.p8` private key's PEM content, base64-encoded
    /// to dodge the multiline-env-var problem `APP_STORE_CONNECT_PRIVATE_KEY`
    /// works around with `\n` escaping instead - same key material, just a
    /// different encoding convention for this one.
    pub apns_key_b64: Option<String>,
    pub apns_key_id: Option<String>,
    pub apns_team_id: Option<String>,
    /// The app's bundle id (APNs calls this the "topic", same value).
    pub apns_bundle_id: Option<String>,
    /// Defaults to the sandbox endpoint - a dev build's token only works
    /// there, and sending a sandbox token to the production endpoint (or
    /// the reverse) fails outright. Set to `true` for the real deploy.
    #[serde(default)]
    pub apns_production: bool,
}

fn default_from_email() -> String {
    "Pavé <hello@pave.app>".to_string()
}
