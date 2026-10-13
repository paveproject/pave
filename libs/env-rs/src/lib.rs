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

/// Loads `T` from the process environment (call `dotenvy::dotenv()` once
/// in `main`, before this, so a local `.env` file is merged in first).
/// Panics with every missing/invalid field listed - fail fast at boot,
/// not deep inside a request handler or background job.
pub fn load<T: serde::de::DeserializeOwned>() -> T {
    envy::from_env::<T>().unwrap_or_else(|error| panic!("invalid configuration: {error}"))
}
