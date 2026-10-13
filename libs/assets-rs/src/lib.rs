//! Typed asset-path manifest generated from `libs/assets/static/**` by
//! `build.rs` - mirrors `@libs/assets`'s TS `assetPaths`/`assetUrl` so both
//! ecosystems stay conceptually identical (see that crate's README for the
//! folder-layout conventions and how files get there in production).
//!
//! Unlike the TS version, this regenerates on *every* `cargo build` - no
//! separate codegen step to remember to run, and renaming/removing a file
//! under `static/` is a compile error here instead of a silently broken
//! URL in production. If a change under `static/` doesn't seem to take
//! effect, `cargo clean -p assets` forces a rebuild - cargo's
//! `rerun-if-changed` on a directory isn't guaranteed to catch every
//! added/removed file on every filesystem.
pub mod paths {
    include!(concat!(env!("OUT_DIR"), "/manifest.rs"));
}

/// Mirrors `@libs/assets`'s `assetUrl()`. `asset_path` should be one of the
/// `paths::*` constants, e.g. `paths::app::ICON`.
pub fn asset_url(asset_path: &str, base_url: &str) -> String {
    format!("{}/{}", base_url.trim_end_matches('/'), asset_path)
}
