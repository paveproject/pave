//! Typed env-var loading shared by `apps/api` and `apps/notify`. Each
//! binary defines its own top-level config struct next to its `main.rs`
//! (e.g. `apps/api/src/config.rs`) and loads it once at startup with
//! [`load`] - fail fast with every missing/invalid field listed, instead
//! of each one failing lazily and separately wherever it's first read.
//!
//! Only put something in this shared crate once two apps actually need
//! the same piece of config with the same meaning - [`RedisConfig`]
//! qualifies today (identical env vars, identical URL-building logic,
//! previously duplicated verbatim in both `main.rs`). Everything else
//! stays local to the app that needs it.

mod redis;

pub use redis::RedisConfig;

/// Loads the repo root's `.env` (found by searching the working directory
/// and its parents - works in dev regardless of where `cargo run`/
/// `cargo-watch` was invoked from), then this app's own `apps/<name>/.env`
/// on top of it, overriding any key both files set. Call once at the very
/// top of `main`, before [`load`]:
/// ```ignore
/// env_rs::load_dotenv(env!("CARGO_MANIFEST_DIR"));
/// ```
/// `env!("CARGO_MANIFEST_DIR")` has to be written at the call site, not in
/// here - it's a compile-time macro that resolves to whichever crate it's
/// written in, so evaluating it inside this crate would always give this
/// crate's own directory instead of the caller's.
pub fn load_dotenv(app_manifest_dir: &str) {
    dotenvy::dotenv().ok();
    dotenvy::from_path_override(std::path::Path::new(app_manifest_dir).join(".env")).ok();
}

/// Loads `T` from the process environment (call [`load_dotenv`] first so
/// local `.env` files are merged in). Panics with every missing/invalid
/// field listed - fail fast at boot, not deep inside a request handler or
/// background job.
pub fn load<T: serde::de::DeserializeOwned>() -> T {
    envy::from_env::<T>().unwrap_or_else(|error| panic!("invalid configuration: {error}"))
}
