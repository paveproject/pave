//! Firebase Cloud Messaging, HTTP v1 API. No crate for this: the few that
//! exist on crates.io are thin and barely maintained, and this is the same
//! "sign a JWT, cache it, call a REST API" shape `apps/api`'s
//! `AppStoreConnectClient` already implements - reusing that pattern here
//! keeps both providers' credential handling consistent instead of pulling
//! in a wrapper crate for something this small.
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;
use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const SCOPE: &str = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
// Google issues tokens valid up to 1h; refresh a little early.
const TOKEN_LIFETIME_SECONDS: u64 = 55 * 60;
const TOKEN_REFRESH_MARGIN_SECONDS: u64 = 60;

struct ServiceAccount {
    client_email: String,
    /// PEM content - decoded once from `FIREBASE_PRIVATE_KEY_B64` in `new`,
    /// same base64 convention as `APNS_KEY_B64` (dodges the
    /// multiline-env-var problem).
    private_key_pem: String,
    project_id: String,
}

#[derive(Serialize)]
struct Claims {
    iss: String,
    scope: &'static str,
    aud: &'static str,
    iat: u64,
    exp: u64,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

struct CachedToken {
    value: String,
    expires_at: u64,
}

pub struct FcmClient {
    service_account: ServiceAccount,
    http: reqwest::Client,
    token: Mutex<Option<CachedToken>>,
}

impl FcmClient {
    /// `None` if `private_key_b64` doesn't decode into valid PEM - logged,
    /// not panicked, same "ship before credentials exist" reasoning as
    /// `AppStoreConnectClient`.
    pub fn new(project_id: &str, client_email: &str, private_key_b64: &str) -> Option<Self> {
        let private_key_bytes = BASE64
            .decode(private_key_b64.trim())
            .inspect_err(
                |err| tracing::error!(%err, "FIREBASE_PRIVATE_KEY_B64 is not valid base64"),
            )
            .ok()?;
        let private_key_pem = String::from_utf8(private_key_bytes)
            .inspect_err(
                |err| tracing::error!(%err, "FIREBASE_PRIVATE_KEY_B64 does not decode to UTF-8"),
            )
            .ok()?;

        Some(Self {
            service_account: ServiceAccount {
                client_email: client_email.to_string(),
                private_key_pem,
                project_id: project_id.to_string(),
            },
            http: reqwest::Client::new(),
            token: Mutex::new(None),
        })
    }

    async fn access_token(&self) -> Option<String> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs();

        if let Some(cached) = self.token.lock().unwrap().as_ref() {
            if cached.expires_at > now {
                return Some(cached.value.clone());
            }
        }

        let encoding_key =
            EncodingKey::from_rsa_pem(self.service_account.private_key_pem.as_bytes())
                .inspect_err(|err| tracing::error!(%err, "invalid FCM service account private key"))
                .ok()?;

        let claims = Claims {
            iss: self.service_account.client_email.clone(),
            scope: SCOPE,
            aud: TOKEN_URL,
            iat: now,
            exp: now + TOKEN_LIFETIME_SECONDS,
        };
        let assertion = encode(&Header::new(Algorithm::RS256), &claims, &encoding_key)
            .inspect_err(|err| tracing::error!(%err, "failed to sign FCM JWT assertion"))
            .ok()?;

        let response = self
            .http
            .post(TOKEN_URL)
            .form(&[
                ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
                ("assertion", assertion.as_str()),
            ])
            .send()
            .await
            .inspect_err(|err| tracing::error!(%err, "FCM token exchange request failed"))
            .ok()?;

        if !response.status().is_success() {
            tracing::error!(status = %response.status(), "FCM token exchange failed");
            return None;
        }

        let token: TokenResponse = response
            .json()
            .await
            .inspect_err(|err| tracing::error!(%err, "failed to parse FCM token response"))
            .ok()?;

        let expires_at =
            now + token.expires_in.min(TOKEN_LIFETIME_SECONDS) - TOKEN_REFRESH_MARGIN_SECONDS;
        *self.token.lock().unwrap() = Some(CachedToken {
            value: token.access_token.clone(),
            expires_at,
        });
        Some(token.access_token)
    }

    pub async fn send(
        &self,
        device_token: &str,
        title: &str,
        body: &str,
        data: &serde_json::Value,
    ) -> Result<(), String> {
        let access_token = self
            .access_token()
            .await
            .ok_or("FCM access token unavailable")?;

        let message = serde_json::json!({
            "message": {
                "token": device_token,
                "notification": { "title": title, "body": body },
                "data": flatten_to_string_map(data),
            }
        });

        let url = format!(
            "https://fcm.googleapis.com/v1/projects/{}/messages:send",
            self.service_account.project_id
        );

        let response = self
            .http
            .post(&url)
            .bearer_auth(access_token)
            .json(&message)
            .send()
            .await
            .map_err(|err| format!("FCM send request failed: {err}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            return Err(format!("FCM send failed ({status}): {text}"));
        }

        Ok(())
    }
}

/// FCM's `data` field only accepts string values - flatten anything else
/// (numbers, bools, nested objects/arrays) to its string/JSON form rather
/// than rejecting the whole message. Not an object at all (null, array,
/// scalar) sends no data, same as an absent field.
fn flatten_to_string_map(value: &serde_json::Value) -> HashMap<String, String> {
    let serde_json::Value::Object(map) = value else {
        return HashMap::new();
    };
    map.iter()
        .map(|(key, value)| {
            let as_string = match value {
                serde_json::Value::String(s) => s.clone(),
                other => other.to_string(),
            };
            (key.clone(), as_string)
        })
        .collect()
}
