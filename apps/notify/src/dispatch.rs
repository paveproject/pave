use notify_contracts::{
    LinkEmailPayload, NotifyJob, OtpEmailPayload, OtpKind, PushContent, PushNotificationPayload,
};
use resend_rs::types::CreateEmailBaseOptions;
use resend_rs::Resend;
use std::sync::Arc;

use crate::email;
use crate::i18n::Dictionaries;
use crate::push::PushSender;

#[derive(Clone)]
pub struct State {
    pub resend: Resend,
    pub dictionaries: Dictionaries,
    pub from_email: String,
    pub assets_base_url: String,
    pub push_sender: Arc<PushSender>,
}

type DynError = Box<dyn std::error::Error + Send + Sync>;

pub async fn handle(state: &State, name: &str, data: serde_json::Value) -> Result<(), DynError> {
    let job = match NotifyJob::from_raw(name, data)? {
        Some(job) => job,
        None => {
            tracing::warn!(%name, "unhandled notify job, skipping");
            return Ok(());
        }
    };

    match job {
        NotifyJob::AuthVerificationEmail(p) => send_link_email(state, &p, "verify_email").await,
        NotifyJob::AuthDeleteAccountEmail(p) => {
            send_link_email(state, &p, "delete_account_email").await
        }
        NotifyJob::AuthResetPassword(p) => send_link_email(state, &p, "reset_password").await,
        NotifyJob::AuthSignInOtpEmail(p) => send_otp_email(state, &p).await,
        NotifyJob::AuthVerificationOtpEmail(p) => send_otp_email(state, &p).await,
        NotifyJob::AuthPasswordResetOtpEmail(p) => send_otp_email(state, &p).await,
        NotifyJob::PushNotification(p) => send_push_notification(state, &p).await,
    }
}

async fn send_push_notification(
    state: &State,
    payload: &PushNotificationPayload,
) -> Result<(), DynError> {
    let t = |key: &str| state.dictionaries.t(payload.lang, key);

    let (title, body) = match &payload.content {
        PushContent::TrustedContactAccepted { actor_username } => {
            let actor_name = actor_username
                .clone()
                .unwrap_or_else(|| t("trusted_contact.someone"));
            (
                t("trusted_contact.accepted.title"),
                t("trusted_contact.accepted.body").replace("{actorName}", &actor_name),
            )
        }
    };

    state
        .push_sender
        .send(
            payload.provider,
            &payload.token,
            &title,
            &body,
            &payload.data,
        )
        .await;
    Ok(())
}

async fn send_link_email(
    state: &State,
    payload: &LinkEmailPayload,
    i18n_key: &str,
) -> Result<(), DynError> {
    let t = |suffix: &str| {
        state
            .dictionaries
            .t(payload.lang, &format!("auth.{i18n_key}.{suffix}"))
    };

    let title = t("title");
    let text = t("text");
    let button = t("button");
    let subject = t("subject");
    let html = email::render(
        &title,
        &text,
        Some((&button, &payload.url)),
        &state.assets_base_url,
    );

    send(state, &payload.email, &subject, &html).await
}

async fn send_otp_email(state: &State, payload: &OtpEmailPayload) -> Result<(), DynError> {
    let i18n_key = match payload.kind {
        OtpKind::SignIn => "sign_in_otp_email",
        OtpKind::EmailVerification => "verification_otp_email",
        OtpKind::ForgetPassword => "password_reset_otp_email",
    };
    let t = |suffix: &str| {
        state
            .dictionaries
            .t(payload.lang, &format!("auth.{i18n_key}.{suffix}"))
    };

    let title = t("title");
    let text = t("text").replace("{otp}", &payload.otp);
    let subject = t("subject");
    // The original template never passed a url for OTP emails, so no button
    // was ever rendered for this job family - keep that behavior.
    let html = email::render(&title, &text, None, &state.assets_base_url);

    send(state, &payload.email, &subject, &html).await
}

async fn send(state: &State, to: &str, subject: &str, html: &str) -> Result<(), DynError> {
    let email = CreateEmailBaseOptions::new(&state.from_email, [to], subject).with_html(html);
    state.resend.emails.send(email).await?;
    Ok(())
}
