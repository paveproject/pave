//! Shared integration-test harness for `apps/api` - every `apps/api/tests/*.rs`
//! file depends on this crate instead of redeclaring its own copy of
//! `TestApp`/`fresh_app`/etc. Each `tests/*.rs` file is its own compiled
//! binary (Cargo's own convention), so keeping the harness here - a
//! normal dependency, built once - instead of in a `tests/common/` module
//! (rebuilt by every single one of those binaries) is what keeps `cargo
//! test` from getting slower every time a new test file is added.

mod app;
mod scenarios;

pub use app::{
    fresh_app, shared_test_env, start_test_env, with_search_path, CapturingOtpSender, TestApp,
    TestEnv, APP_STORE_CONNECT_WEBHOOK_SECRET, INTERNAL_VERSION_POLICY_SECRET,
};
pub use scenarios::{
    add_accepted_trusted_contact, register_device, setup_recovery_scenario,
    sign_in_as_accepted_contact, sign_in_with_two_devices, RecoverySetup, TwoDevices,
};
