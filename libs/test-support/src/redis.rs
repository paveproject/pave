use testcontainers::runners::AsyncRunner;
use testcontainers::{ContainerAsync, ImageExt};
use testcontainers_modules::redis::{Redis, REDIS_PORT};

/// One real Redis testcontainer - `bullmq-rs` talks to it exactly as it
/// would to the real dev/prod instance, so an enqueued job's actual Redis
/// shape (job hash, delayed/wait sets) is what gets asserted on, not a
/// mocked queue client.
pub struct TestRedis {
    _container: ContainerAsync<Redis>,
    host: String,
    port: u16,
}

impl TestRedis {
    pub fn url(&self) -> String {
        format!("redis://{}:{}", self.host, self.port)
    }
}

pub async fn start_test_redis() -> TestRedis {
    let container = Redis::default()
        .with_tag("7-alpine")
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
        _container: container,
        host,
        port,
    }
}
