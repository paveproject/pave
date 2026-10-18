use notify_contracts::{
    Lang, LinkEmailPayload, NotifyJob, OtpEmailPayload, OtpKind, PushContent, PushNotifyPayload,
    PushProvider,
};
use resend_rs::types::CreateEmailBaseOptions;
use resend_rs::Resend;
use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::sync::Arc;

use crate::email;
use crate::i18n::Dictionaries;
use crate::push::PushSender;
use crate::recipients::resolve_push_recipients;

#[derive(Clone)]
pub struct State {
    pub db: DatabaseConnection,
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
        NotifyJob::RecoveryRequestCreatedEmail(p) => {
            send_recovery_request_email(state, &p, "created_email").await
        }
        NotifyJob::RecoveryRequestReadyEmail(p) => {
            send_recovery_request_email(state, &p, "ready_email").await
        }
        NotifyJob::PushNotification(p) => send_push_notification(state, &p).await,
    }
}

/// `title`/`body` only ever depend on `content`/`lang` - the language
/// groups `send_push_notification` fans out to all render the same two
/// strings once, not once per token.
fn render_content(
    dictionaries: &Dictionaries,
    lang: Lang,
    content: &PushContent,
) -> (String, String) {
    let t = |key: &str| dictionaries.t(lang, key);

    match content {
        PushContent::TrustedContactAccepted { actor_username } => {
            let actor_name = actor_username
                .clone()
                .unwrap_or_else(|| t("trusted_contact.someone"));
            (
                t("trusted_contact.accepted.title"),
                t("trusted_contact.accepted.body").replace("{actorName}", &actor_name),
            )
        }
        PushContent::RecoveryRequestCreated { owner_username } => {
            let owner_name = owner_username
                .clone()
                .unwrap_or_else(|| t("recovery_request.someone"));
            (
                t("recovery_request.created.title"),
                t("recovery_request.created.body").replace("{ownerName}", &owner_name),
            )
        }
        PushContent::RecoveryRequestContactResponded {
            approved,
            declined,
            total,
        } => (
            t("recovery_request.contact_responded.title"),
            t("recovery_request.contact_responded.body")
                .replace("{approved}", &approved.to_string())
                .replace("{declined}", &declined.to_string())
                .replace("{total}", &total.to_string()),
        ),
        PushContent::RecoveryRequestFailed => (
            t("recovery_request.failed.title"),
            t("recovery_request.failed.body"),
        ),
        PushContent::DeviceApprovalRequested => (
            t("device.approval_requested.title"),
            t("device.approval_requested.body"),
        ),
        PushContent::DeviceApproved => (t("device.approved.title"), t("device.approved.body")),
        PushContent::DeviceDeclined => (t("device.declined.title"), t("device.declined.body")),
        PushContent::RecoveryRequestReady => (
            t("recovery_request.ready.title"),
            t("recovery_request.ready.body"),
        ),
    }
}

async fn send_push_notification(
    state: &State,
    payload: &PushNotifyPayload,
) -> Result<(), DynError> {
    let recipients = resolve_push_recipients(&state.db, &payload.target).await;
    if recipients.is_empty() {
        return Ok(());
    }

    // FCM/APNs can't mix languages in one call - group first, render each
    // group's title/body once, then send that group as a single batch.
    let mut groups: HashMap<(PushProvider, Lang), Vec<String>> = HashMap::new();
    for recipient in recipients {
        groups
            .entry((recipient.provider, recipient.lang))
            .or_default()
            .push(recipient.token);
    }

    // The device's actual deep-link data - always exactly `content` itself
    // (see `PushContent`'s own doc comment), never a separately-maintained
    // value that could drift out of sync with what `render_content` just
    // rendered from the same enum.
    let data = serde_json::to_value(&payload.content).expect("PushContent always serializes");

    for ((provider, lang), tokens) in groups {
        let (title, body) = render_content(&state.dictionaries, lang, &payload.content);
        state
            .push_sender
            .send_batch(provider, &tokens, &title, &body, &data)
            .await;
    }

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

/// Not under the `auth.*` namespace like `send_link_email`'s callers - these
/// aren't auth emails, they're the recovery-request safety net and its
/// "come back and finish" counterpart (see `NotifyJob::RecoveryRequestCreatedEmail`/
/// `RecoveryRequestReadyEmail`'s own doc comments) - so `i18n_key` is either
/// `created_email` or `ready_email`, read directly instead of going through
/// `send_link_email`'s hardcoded `auth.` prefix.
async fn send_recovery_request_email(
    state: &State,
    payload: &LinkEmailPayload,
    i18n_key: &str,
) -> Result<(), DynError> {
    let t = |suffix: &str| {
        state.dictionaries.t(
            payload.lang,
            &format!("recovery_request.{i18n_key}.{suffix}"),
        )
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
