//! One-off manual test: enqueues a real `NotifyJob::PushNotification` onto
//! the local `notify_queue` so the running `notify` worker picks it up and
//! actually sends it. Not part of any build/deploy pipeline - delete once
//! push notifications have a real trigger point.
//!
//! Usage: `cargo run -p notify --bin send_test_push -- <provider> <token>`
//! (provider: fcm | apns)

use bullmq_rs::{QueueBuilder, RedisConnection};
use notify_contracts::{NotifyJob, PushNotificationPayload, PushProvider, NOTIFY_QUEUE};

#[tokio::main]
async fn main() {
    env_rs::load_dotenv(env!("CARGO_MANIFEST_DIR"));

    let args: Vec<String> = std::env::args().collect();
    let provider = match args.get(1).map(String::as_str) {
        Some("fcm") => PushProvider::Fcm,
        Some("apns") => PushProvider::Apns,
        _ => {
            eprintln!("usage: send_test_push <fcm|apns> <token>");
            std::process::exit(1);
        }
    };
    let token = args.get(2).cloned().unwrap_or_else(|| {
        eprintln!("usage: send_test_push <fcm|apns> <token>");
        std::process::exit(1);
    });

    let redis: env_rs::RedisConfig = env_rs::load();
    let conn = RedisConnection::new(redis.url());
    let queue = QueueBuilder::new(NOTIFY_QUEUE)
        .connection(conn)
        .build::<serde_json::Value>()
        .await
        .expect("failed to build queue producer");

    let job = NotifyJob::PushNotification(PushNotificationPayload {
        provider,
        token,
        title: "Pavé".to_string(),
        body: "Test push depuis send_test_push".to_string(),
        data: serde_json::json!({ "type": "test" }),
    });

    queue
        .add(job.name(), job.data(), None)
        .await
        .expect("failed to enqueue test push job");

    println!("enqueued - check the notify worker's logs");
}
