use sea_orm::{ConnectionTrait, Database, DatabaseConnection};
use std::path::PathBuf;
use std::process::Command;
use testcontainers::core::{IntoContainerPort, WaitFor};
use testcontainers::runners::{AsyncBuilder, AsyncRunner};
use testcontainers::{ContainerAsync, GenericBuildableImage, GenericImage, ImageExt};

const SNAPSHOT_NAME: &str = "migrated_template";
const WORK_DB_NAME: &str = "test";
const PG_USER: &str = "test";
const PG_PASSWORD: &str = "test";

fn workspace_root() -> PathBuf {
    // This crate lives at <root>/libs/test-support.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .canonicalize()
        .expect("failed to resolve workspace root from CARGO_MANIFEST_DIR")
}

fn run_db_command(program: &str, args: &[&str], database_url: &str) {
    let status = Command::new(program)
        .args(args)
        .current_dir(workspace_root())
        .env("DATABASE_URL", database_url)
        .status()
        .unwrap_or_else(|err| panic!("failed to spawn `{program}`: {err}"));
    assert!(status.success(), "`{program} {args:?}` failed");
}

/// One Postgres testcontainer, migrated + seeded once and snapshotted as a
/// template - built from the exact same `apps/postgres/Dockerfile` the real
/// app runs on (the postgis extension the migrations enable), not a plain
/// upstream image. Kept alive for the whole test binary; share one
/// instance across every `#[tokio::test]` in the file and call `reset()`
/// between tests instead of starting a fresh container each time.
pub struct TestDatabase {
    // Never read again after start() - only here so the container isn't
    // dropped (and torn down) while this struct is still alive.
    _container: ContainerAsync<GenericImage>,
    host: String,
    port: u16,
}

impl TestDatabase {
    fn url_for(&self, db_name: &str) -> String {
        format!(
            "postgres://{PG_USER}:{PG_PASSWORD}@{}:{}/{db_name}",
            self.host, self.port
        )
    }

    /// The working database's connection string - same shape
    /// `auth::database_url()` expects, minus the `search_path` override
    /// (callers building a real `AppState` still need to add that
    /// themselves, same as `main.rs` does via the real env var).
    pub fn database_url(&self) -> String {
        self.url_for(WORK_DB_NAME)
    }

    /// Drops and recreates the working database from the migrated+seeded
    /// template - near-instant (Postgres copies it at the filesystem
    /// level) compared to re-running every migration per test. Returns a
    /// fresh connection to it; reconnect rather than reusing an old one,
    /// the database it was pointing at no longer exists by the time this
    /// returns.
    pub async fn reset(&self) -> DatabaseConnection {
        let admin = Database::connect(self.url_for("postgres"))
            .await
            .expect("failed to connect to admin db for reset");

        admin
            .execute_unprepared(&format!(
                "SELECT pg_terminate_backend(pid) FROM pg_stat_activity \
                 WHERE datname = '{WORK_DB_NAME}' AND pid <> pg_backend_pid()"
            ))
            .await
            .expect("failed to terminate lingering connections to the test database");

        admin
            .execute_unprepared(&format!(r#"DROP DATABASE IF EXISTS "{WORK_DB_NAME}""#))
            .await
            .expect("failed to drop the test database");

        admin
            .execute_unprepared(&format!(
                r#"CREATE DATABASE "{WORK_DB_NAME}" WITH TEMPLATE "{SNAPSHOT_NAME}""#
            ))
            .await
            .expect("failed to recreate the test database from its template");

        Database::connect(self.database_url())
            .await
            .expect("failed to connect to the freshly-reset test database")
    }
}

/// Boots one Postgres testcontainer for a whole integration-test binary:
/// migrated, seeded, and snapshotted so `TestDatabase::reset()` can restore
/// it quickly between tests.
pub async fn start_test_database() -> TestDatabase {
    let root = workspace_root();

    let built = GenericBuildableImage::new("pave-test-postgres", "local")
        .with_dockerfile(root.join("apps/postgres/Dockerfile"))
        .build_image()
        .await
        .expect("failed to build the postgis-enabled postgres test image");

    let image = built
        .with_exposed_port(5432.tcp())
        .with_wait_for(WaitFor::message_on_stdout(
            "database system is ready to accept connections",
        ))
        .with_env_var("POSTGRES_USER", PG_USER)
        .with_env_var("POSTGRES_PASSWORD", PG_PASSWORD)
        .with_env_var("POSTGRES_DB", WORK_DB_NAME);

    let container = image
        .start()
        .await
        .expect("failed to start postgres testcontainer");
    let host = container
        .get_host()
        .await
        .expect("failed to resolve testcontainer host")
        .to_string();
    let port = container
        .get_host_port_ipv4(5432)
        .await
        .expect("failed to resolve testcontainer's mapped postgres port");

    let db = TestDatabase {
        _container: container,
        host,
        port,
    };

    let database_url = db.database_url();
    run_db_command(
        "bunx",
        &[
            "drizzle-kit",
            "migrate",
            "--config=libs/db/drizzle.config.ts",
        ],
        &database_url,
    );
    run_db_command(
        "bun",
        &["--no-env-file", "libs/db/scripts/seed.ts"],
        &database_url,
    );

    // Snapshot the freshly migrated+seeded database as a template -
    // `CREATE DATABASE ... WITH TEMPLATE` requires no other connections to
    // the *source* database while it copies.
    let admin = Database::connect(db.url_for("postgres"))
        .await
        .expect("failed to connect to admin db to snapshot the template");
    admin
        .execute_unprepared(&format!(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity \
             WHERE datname = '{WORK_DB_NAME}' AND pid <> pg_backend_pid()"
        ))
        .await
        .expect("failed to terminate connections before snapshotting");
    admin
        .execute_unprepared(&format!(
            r#"CREATE DATABASE "{SNAPSHOT_NAME}" WITH TEMPLATE "{WORK_DB_NAME}""#
        ))
        .await
        .expect("failed to snapshot the migrated+seeded template database");

    db
}
