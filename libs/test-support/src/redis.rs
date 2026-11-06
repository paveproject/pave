use testcontainers::core::ExecCommand;
use testcontainers::runners::AsyncRunner;
use testcontainers::{ContainerAsync, ImageExt, ReuseDirective};
use testcontainers_modules::redis::{Redis, REDIS_PORT};

/// Same reuse key as the Postgres container - see `postgres.rs`'s
/// `REUSE_LABEL` for why nothing ever removes these otherwise.
const REUSE_LABEL: &str = "app.pave.test-support";

/// One real Redis testcontainer - `bullmq-rs` talks to it exactly as it
/// would to the real dev/prod instance, so an enqueued job's actual Redis
/// shape (job hash, delayed/wait sets) is what gets asserted on, not a
/// mocked queue client.
pub struct TestRedis {
    container: ContainerAsync<Redis>,
    host: String,
    port: u16,
}

impl TestRedis {
    pub fn url(&self) -> String {
        format!("redis://{}:{}", self.host, self.port)
    }

    /// Wipes every key. The container now outlives the test binary (and the
    /// run), so without this a rate-limit counter or a queued job from an
    /// earlier run would still be there. Shelled out through the container
    /// rather than pulling a redis client into this crate's dependencies.
    pub async fn flush(&self) {
        self.container
            .exec(ExecCommand::new(["redis-cli", "FLUSHALL"]))
            .await
            .expect("failed to flush the redis testcontainer");
    }
}

pub async fn start_test_redis() -> TestRedis {
    let container = Redis::default()
        .with_tag("7-alpine")
        .with_labels([(REUSE_LABEL, "redis")])
        .with_reuse(ReuseDirective::Always)
        .start()
        .await
        .expect("failed to start redis testcontainer");

    let host = container
        .get_host()
        .await
        .expect("failed to resolve redis testcontainer host")
        .to_string();
    let port = container
        .get_host_port_ipv4(REDIS_PORT)
        .await
        .expect("failed to resolve redis testcontainer's mapped port");

    TestRedis {
        container,
        host,
        port,
    }
}
