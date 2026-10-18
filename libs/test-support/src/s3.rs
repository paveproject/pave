use aws_sdk_s3::config::{BehaviorVersion, Credentials, Region};
use aws_sdk_s3::Client;
use testcontainers::core::wait::HttpWaitStrategy;
use testcontainers::core::WaitFor;
use testcontainers::runners::AsyncRunner;
use testcontainers::{ContainerAsync, ImageExt};
use testcontainers_modules::rustfs::RustFS;

const ACCESS_KEY: &str = "test";
const SECRET_KEY: &str = "test-secret-key";
const API_PORT: u16 = 9000;
pub const PUBLIC_BUCKET: &str = "public";
pub const PRIVATE_BUCKET: &str = "private";

/// One real RustFS testcontainer (same image `docker-compose.yaml` runs in
/// dev, pinned to the same tag) - avatar uploads go through the real
/// `aws-sdk-s3` client against it, not a mocked bucket.
pub struct TestS3 {
    _container: ContainerAsync<RustFS>,
    host: String,
    port: u16,
}

impl TestS3 {
    pub fn endpoint_url(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }

    pub fn access_key_id(&self) -> &str {
        ACCESS_KEY
    }

    pub fn secret_access_key(&self) -> &str {
        SECRET_KEY
    }
}

pub async fn start_test_s3() -> TestS3 {
    // The module's own `ready_conditions()` waits for a stdout line
    // ("RustFS Http API:") this pinned image never actually prints -
    // confirmed by hand (`docker logs` never shows it even once the
    // server is already answering requests) - so the container never
    // reports ready and `start()` always times out. Same `/health`
    // check `docker-compose.yaml`'s own healthcheck uses instead.
    let container = RustFS::default()
        .with_tag("1.0.0-alpha.86")
        .with_env_var("RUSTFS_ACCESS_KEY", ACCESS_KEY)
        .with_env_var("RUSTFS_SECRET_KEY", SECRET_KEY)
        .with_ready_conditions(vec![WaitFor::http(
            HttpWaitStrategy::new("/health").with_expected_status_code(200u16),
        )])
        .start()
        .await
        .expect("failed to start rustfs testcontainer");

    let host = container
        .get_host()
        .await
        .expect("failed to resolve rustfs testcontainer host")
        .to_string();
    let port = container
        .get_host_port_ipv4(API_PORT)
        .await
        .expect("failed to resolve rustfs testcontainer's mapped port");

    let s3 = TestS3 {
        _container: container,
        host,
        port,
    };

    let credentials = Credentials::new(ACCESS_KEY, SECRET_KEY, None, None, "static");
    let config = aws_sdk_s3::config::Builder::new()
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new("eu-west-1"))
        .endpoint_url(s3.endpoint_url())
        .credentials_provider(credentials)
        .force_path_style(true)
        .build();
    let client = Client::from_conf(config);
    client
        .create_bucket()
        .bucket(PUBLIC_BUCKET)
        .send()
        .await
        .expect("failed to create the test public bucket");
    client
        .create_bucket()
        .bucket(PRIVATE_BUCKET)
        .send()
        .await
        .expect("failed to create the test private bucket");

    s3
}
