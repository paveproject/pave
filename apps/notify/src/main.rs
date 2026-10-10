mod dispatch;
mod email;
mod i18n;

use bullmq_rs::{RedisConnection, WorkerBuilder};
use dispatch::State;
use notify_contracts::NOTIFY_QUEUE;
use resend_rs::Resend;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .init();

    let state = State {
        resend: Resend::new(&std::env::var("RESEND_API_KEY").expect("RESEND_API_KEY must be set")),
        dictionaries: i18n::Dictionaries::load(),
        from_email: std::env::var("RESEND_FROM_EMAIL")
            .unwrap_or_else(|_| "Pavé <hello@pave.app>".to_string()),
    };

    let conn = RedisConnection::new(&redis_url());
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

fn redis_url() -> String {
    let host = std::env::var("REDIS_HOST").unwrap_or_else(|_| "localhost".to_string());
    let port = std::env::var("REDIS_PORT").unwrap_or_else(|_| "6379".to_string());
    match std::env::var("REDIS_PASSWORD") {
        Ok(password) if !password.is_empty() => format!("redis://:{password}@{host}:{port}"),
        _ => format!("redis://{host}:{port}"),
    }
}
