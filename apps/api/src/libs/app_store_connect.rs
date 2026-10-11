//! Thin, reusable client for the App Store Connect REST API. Its only job
//! today is resolving the `appStoreVersions` id a webhook event refers to
//! (see `apps/api/src/app/webhooks/app_store_connect`) into an actual
//! version string and platform - the webhook payload itself only carries
//! the id and the new state. Adapted from Recomend's TS equivalent
//! (`apps/api/src/common/modules/app-store-connect`).
//!
//! Every credential is read from the environment lazily, at call time, not
//! at startup - this feature can ship (and the webhook route can exist)
//! before an actual App Store Connect API key is provisioned; it just
//! won't resolve anything until one is.

use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone)]
pub struct AppStoreVersionInfo {
    pub version_string: String,
    /// Only `"IOS"` maps to our `AppPlatform` today; other values (`MAC_OS`,
    /// `TV_OS`, ...) are ignored by callers.
    pub platform: String,
    /// The `appStoreVersions.relationships.app` id, when present - lets
    /// callers cross-check the event is about our app.
    pub app_id: Option<String>,
}

#[derive(Debug, Serialize)]
struct Claims {
    iss: String,
    iat: u64,
    exp: u64,
    aud: &'static str,
}

#[derive(Debug, Deserialize)]
struct AppStoreVersionResource {
    data: AppStoreVersionData,
}

#[derive(Debug, Deserialize)]
struct AppStoreVersionData {
    attributes: AppStoreVersionAttributes,
    relationships: Option<AppStoreVersionRelationships>,
}

#[derive(Debug, Deserialize)]
struct AppStoreVersionAttributes {
    #[serde(rename = "versionString")]
    version_string: String,
    platform: String,
}

#[derive(Debug, Deserialize)]
struct AppStoreVersionRelationships {
    app: Option<AppStoreVersionAppRelationship>,
}

#[derive(Debug, Deserialize)]
struct AppStoreVersionAppRelationship {
    data: Option<AppStoreVersionAppRelationshipData>,
}

#[derive(Debug, Deserialize)]
struct AppStoreVersionAppRelationshipData {
    id: String,
}

// App Store Connect API JWTs are ES256, signed with the same kind of .p8 key
// as Sign in with Apple. Apple caps their lifetime at 20 minutes; mint one
// and reuse it until shortly before that, rather than signing a fresh one
// per request.
const TOKEN_LIFETIME_SECONDS: u64 = 19 * 60;
const TOKEN_REFRESH_MARGIN_SECONDS: u64 = 30;

struct CachedToken {
    value: String,
    expires_at: u64,
}

#[derive(Default)]
pub struct AppStoreConnectClient {
    token: Mutex<Option<CachedToken>>,
}

impl AppStoreConnectClient {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn get_app_store_version(&self, id: &str) -> Option<AppStoreVersionInfo> {
        let token = self.token()?;
        let url = format!(
            "https://api.appstoreconnect.apple.com/v1/appStoreVersions/{id}\
             ?fields[appStoreVersions]=versionString,platform"
        );

        let response = reqwest::Client::new()
            .get(&url)
            .bearer_auth(token)
            .send()
            .await
            .inspect_err(|err| tracing::error!(%err, %url, "App Store Connect API request failed"))
            .ok()?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return None;
        }
        if !response.status().is_success() {
            tracing::error!(status = %response.status(), %url, "App Store Connect API request failed");
            return None;
        }

        let resource: AppStoreVersionResource = response
            .json()
            .await
            .inspect_err(|err| tracing::error!(%err, "failed to parse App Store Connect response"))
            .ok()?;

        Some(AppStoreVersionInfo {
            version_string: resource.data.attributes.version_string,
            platform: resource.data.attributes.platform,
            app_id: resource
                .data
                .relationships
                .and_then(|r| r.app)
                .and_then(|a| a.data)
                .map(|d| d.id),
        })
    }

    /// `None` when credentials aren't configured yet, or signing fails -
    /// never panics, this must stay safe to call before the real Apple
    /// credentials exist.
    fn token(&self) -> Option<String> {
        let now = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs();

        if let Some(cached) = self.token.lock().unwrap().as_ref() {
            if cached.expires_at > now {
                return Some(cached.value.clone());
            }
        }

        let private_key = std::env::var("APP_STORE_CONNECT_PRIVATE_KEY")
            .ok()?
            .replace("\\n", "\n");
        let key_id = std::env::var("APP_STORE_CONNECT_KEY_ID").ok()?;
        let issuer_id = std::env::var("APP_STORE_CONNECT_ISSUER_ID").ok()?;

        let encoding_key = EncodingKey::from_ec_pem(private_key.as_bytes())
            .inspect_err(|err| tracing::error!(%err, "invalid APP_STORE_CONNECT_PRIVATE_KEY"))
            .ok()?;

        let exp = now + TOKEN_LIFETIME_SECONDS;
        let mut header = Header::new(Algorithm::ES256);
        header.kid = Some(key_id);
        let claims = Claims {
            iss: issuer_id,
            iat: now,
            exp,
            aud: "appstoreconnect-v1",
        };

        let value = encode(&header, &claims, &encoding_key)
            .inspect_err(|err| tracing::error!(%err, "failed to sign App Store Connect JWT"))
            .ok()?;

        *self.token.lock().unwrap() = Some(CachedToken {
            value: value.clone(),
            expires_at: exp - TOKEN_REFRESH_MARGIN_SECONDS,
        });
        Some(value)
    }
}
