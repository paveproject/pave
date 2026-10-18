//! Shared integration-test infrastructure: real Postgres + real Redis +
//! real RustFS (S3) testcontainers, built from/talked to the same way the
//! real app does (same `apps/postgres` Dockerfile, same `bullmq-rs` queue
//! client, same `aws-sdk-s3` client) - never a hand-rolled fake standing
//! in for any of them, so a passing test means the real code paths
//! actually work against real infra, not just against a model of it.

mod postgres;
mod redis;
mod s3;

pub use postgres::{start_test_database, TestDatabase};
pub use redis::{start_test_redis, TestRedis};
pub use s3::{start_test_s3, TestS3, PUBLIC_BUCKET};
