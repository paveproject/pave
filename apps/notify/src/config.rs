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
}

fn default_from_email() -> String {
    "Pavé <hello@pave.app>".to_string()
}
