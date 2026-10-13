mod config;
mod dispatch;
mod email;
mod i18n;
mod push;

use bullmq_rs::{RedisConnection, WorkerBuilder};
use config::NotifyConfig;
use dispatch::State;
use env_rs::RedisConfig;
use notify_contracts::NOTIFY_QUEUE;
use push::PushSender;
use resend_rs::Resend;
use std::sync::Arc;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Repo root's .env (DATABASE_URL, REDIS_*, shared across apps) then
    // this crate's own apps/notify/.env on top (APNS_*/FIREBASE_*, specific
    // to this app) - unlike Bun, cargo/rustc never load either on their
    // own, so every env var below would otherwise depend on the shell that
    // launched this process having sourced it manually. See env_rs::load_dotenv.
    env_rs::load_dotenv(env!("CARGO_MANIFEST_DIR"));
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let config: NotifyConfig = env_rs::load();
    let redis: RedisConfig = env_rs::load();

    let assets_base_url = config.assets_base_url.clone().unwrap_or_else(|| {
        tracing::warn!("ASSETS_BASE_URL not set - emails will go out with a broken logo image");
        String::new()
    });

    let push_sender = Arc::new(PushSender::new(
        config.fcm_project_id.as_deref(),
        config.fcm_client_email.as_deref(),
        config.fcm_private_key_b64.as_deref(),
        config.apns_key_b64.as_deref(),
        config.apns_key_id.as_deref(),
        config.apns_team_id.as_deref(),
        config.apns_bundle_id.clone(),
        config.apns_production,
    ));

    let state = State {
        resend: Resend::new(&config.resend_api_key),
        dictionaries: i18n::Dictionaries::load(),
        from_email: config.resend_from_email,
        assets_base_url,
        push_sender,
    };

    let conn = RedisConnection::new(redis.url());
    let worker = WorkerBuilder::new(NOTIFY_QUEUE)
        .connection(conn)
        .concurrency(5)
        .on_failed(|job, err| tracing::error!(job_id = %job.id, %err, "notify job failed"))
        .build::<serde_json::Value>();

    tracing::info!(queue = NOTIFY_QUEUE, "notify worker starting");

    let handle = worker
        .start(move |job| {
            let state = state.clone();
            async move { dispatch::handle(&state, &job.name, job.data.clone()).await }
        })
        .await?;

    tokio::signal::ctrl_c().await?;
    tracing::info!("shutting down notify worker");
    handle.shutdown();
    handle.wait().await?;
    Ok(())
}
