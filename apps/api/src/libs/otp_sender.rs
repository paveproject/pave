//! [`auth::OtpEmailSender`] implementation: enqueues the exact same BullMQ
//! job `notify` (apps/notify, Rust) already knows how to send - the API
//! never waits on an email provider, it just hands the code to Redis.

use async_trait::async_trait;
use auth::{OtpEmailSender, OtpPurpose};
use better_auth::{AuthError, AuthResult};
use bullmq_rs::{Queue, QueueBuilder, RedisConnection};
use notify_contracts::{Lang, NotifyJob, OtpEmailPayload, OtpKind, NOTIFY_QUEUE};

pub struct BullmqOtpSender {
    queue: Queue<serde_json::Value>,
}

impl BullmqOtpSender {
    pub async fn connect(redis_url: &str) -> Self {
        let conn = RedisConnection::new(redis_url);
        let queue = QueueBuilder::new(NOTIFY_QUEUE)
            .connection(conn)
            .build::<serde_json::Value>()
            .await
            .expect("failed to build notify_queue producer");
        Self { queue }
    }
}

#[async_trait]
impl OtpEmailSender for BullmqOtpSender {
    async fn send_otp(
        &self,
        email: &str,
        otp: &str,
        lang: &str,
        purpose: OtpPurpose,
    ) -> AuthResult<()> {
        let lang = match lang {
            "fr-FR" => Lang::Fr,
            _ => Lang::En,
        };
        let kind = match purpose {
            OtpPurpose::SignIn => OtpKind::SignIn,
            OtpPurpose::ChangeEmail => OtpKind::EmailVerification,
        };
        let job = NotifyJob::AuthSignInOtpEmail(OtpEmailPayload {
            email: email.to_string(),
            otp: otp.to_string(),
            kind,
            lang,
        });

        self.queue
            .add(job.name(), job.data(), None)
            .await
            .map_err(|error| {
                AuthError::internal(format!("failed to enqueue OTP email: {error}"))
            })?;

        Ok(())
    }
}
