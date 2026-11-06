use sea_orm::{ConnectionTrait, Database, DatabaseConnection, Statement};
use std::path::{Path, PathBuf};
use std::process::Command;
use testcontainers::core::{IntoContainerPort, WaitFor};
use testcontainers::runners::{AsyncBuilder, AsyncRunner};
use testcontainers::{
    ContainerAsync, GenericBuildableImage, GenericImage, ImageExt, ReuseDirective,
};

/// Reuse key. One Postgres container serves every test binary and every run:
/// `ContainerAsync`'s `Drop` is the only thing that removes a container in
/// testcontainers 0.27 (there is no reaper), and it never runs here - the
/// handle lives in a `static OnceCell`, and Rust doesn't drop statics at exit.
/// Without reuse, each `cargo test` left its containers behind for good.
const REUSE_LABEL: &str = "app.pave.test-support";
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
    /// Template to restore from, named after `schema_fingerprint`.
    snapshot: String,
}

/// Fingerprint of everything that shapes the template: the migrations and the
/// seed. It goes in the template database's *name*, so a changed migration or
/// seed finds no template and builds a fresh one - inside the same reused
/// container. Without this, reuse would happily serve a stale schema, which is
/// a worse failure than the leak it fixes.
///
/// FNV-1a rather than `DefaultHasher`: this value has to mean the same thing
/// across toolchain versions, or every upgrade would silently rebuild.
///
/// Old templates are left in place (17 MB each) rather than swept, so moving
/// between branches with different schemas costs nothing. To reclaim them:
/// `docker exec <container> psql -U test -d postgres -c "DROP DATABASE
/// migrated_template_<hash>"`.
fn schema_fingerprint(root: &Path) -> String {
    let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
    let mut feed = |bytes: &[u8]| {
        for byte in bytes {
            hash ^= u64::from(*byte);
            hash = hash.wrapping_mul(0x100_0000_01b3);
        }
    };

    fn collect(dir: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = std::fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                collect(&path, out);
            } else {
                out.push(path);
            }
        }
    }

    let mut files = Vec::new();
    collect(&root.join("libs/db/drizzle"), &mut files);
    collect(&root.join("libs/db/src/lib/seed"), &mut files);
    files.push(root.join("libs/db/scripts/seed.ts"));
    files.sort();

    for file in files {
        feed(
            file.strip_prefix(root)
                .unwrap_or(&file)
                .to_string_lossy()
                .as_bytes(),
        );
        if let Ok(bytes) = std::fs::read(&file) {
            feed(&bytes);
        }
    }
    format!("migrated_template_{hash:016x}")
}

/// The postgres entrypoint prints "ready to accept connections" once during
/// its own init phase and then restarts, so the wait strategy can return
/// before the server really accepts anything. This used to be hidden: the
/// first thing that connected was `drizzle-kit`, a separate process with its
/// own connect timing. Connecting from here needs the wait made explicit.
async fn connect_admin(url: &str) -> DatabaseConnection {
    let mut last = None;
    for _ in 0..40 {
        match Database::connect(url).await {
            Ok(connection) => return connection,
            Err(error) => {
                last = Some(error);
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            }
        }
    }
    panic!("postgres never accepted an admin connection: {last:?}");
}

async fn database_exists(admin: &DatabaseConnection, name: &str) -> bool {
    admin
        .query_one_raw(Statement::from_string(
            sea_orm::DatabaseBackend::Postgres,
            format!("SELECT 1 FROM pg_database WHERE datname = '{name}'"),
        ))
        .await
        .expect("failed to look up the template database")
        .is_some()
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
                r#"CREATE DATABASE "{WORK_DB_NAME}" WITH TEMPLATE "{}""#,
                self.snapshot
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

    let snapshot = schema_fingerprint(&root);

    let image = built
        .with_exposed_port(5432.tcp())
        .with_wait_for(WaitFor::message_on_stdout(
            "database system is ready to accept connections",
        ))
        .with_env_var("POSTGRES_USER", PG_USER)
        .with_env_var("POSTGRES_PASSWORD", PG_PASSWORD)
        .with_env_var("POSTGRES_DB", WORK_DB_NAME)
        .with_labels([(REUSE_LABEL, "postgres")])
        .with_reuse(ReuseDirective::Always);

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
        snapshot: snapshot.clone(),
    };

    let admin = connect_admin(&db.url_for("postgres")).await;
    if database_exists(&admin, &snapshot).await {
        // Reused container, template already built for this exact schema.
        return db;
    }

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
    admin
        .execute_unprepared(&format!(
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity \
             WHERE datname = '{WORK_DB_NAME}' AND pid <> pg_backend_pid()"
        ))
        .await
        .expect("failed to terminate connections before snapshotting");
    admin
        .execute_unprepared(&format!(
            r#"CREATE DATABASE "{snapshot}" WITH TEMPLATE "{WORK_DB_NAME}""#
        ))
        .await
        .expect("failed to snapshot the migrated+seeded template database");

    db
}
