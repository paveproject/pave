//! Shared BullMQ contract between `api` (producer) and `notify` (consumer):
//! the queue name, every job name on it, and the exact payload shape for
//! each. Both sides depend on this crate so a payload change is a compile
//! error on whichever side wasn't updated, instead of a runtime mismatch.

use serde::{Deserialize, Serialize};

pub const NOTIFY_QUEUE: &str = "notify_queue";

pub mod job_names {
    pub const AUTH_VERIFICATION_EMAIL: &str = "auth:verification-email";
    pub const AUTH_DELETE_ACCOUNT_EMAIL: &str = "auth:delete-account-email";
    pub const AUTH_RESET_PASSWORD: &str = "auth:reset-password";
    pub const AUTH_SIGN_IN_OTP_EMAIL: &str = "auth:sign-in-otp-email";
    pub const AUTH_VERIFICATION_OTP_EMAIL: &str = "auth:verification-otp-email";
    pub const AUTH_PASSWORD_RESET_OTP_EMAIL: &str = "auth:password-reset-otp-email";
    pub const PUSH_NOTIFICATION: &str = "push:notification";
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "lowercase")]
pub enum Lang {
    #[default]
    En,
    Fr,
}

impl Lang {
    pub fn as_str(&self) -> &'static str {
        match self {
            Lang::En => "en",
            Lang::Fr => "fr",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum OtpKind {
    SignIn,
    EmailVerification,
    ForgetPassword,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LinkEmailPayload {
    pub email: String,
    pub url: String,
    #[serde(default)]
    pub lang: Lang,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtpEmailPayload {
    pub email: String,
    pub otp: String,
    #[serde(rename = "type")]
    pub kind: OtpKind,
    #[serde(default)]
    pub lang: Lang,
}

/// `fcm`/`apns` only - the one-time `expo` value this project briefly used
/// is gone, see `apps/notify/src/push` for why (throttling, and APNs/FCM
/// credentials were already set up elsewhere).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PushProvider {
    Fcm,
    Apns,
}

/// One push notification, one device token - a user with several devices
/// means several of these, one job each (simpler than looping over tokens,
/// and partial failure, inside a single job). The producer (`apps/api`)
/// resolves `token`/`provider` from its own `push_token` table and
/// pre-renders `title`/`body` - `notify` has no database access and does
/// no i18n lookup for push, unlike the email jobs above.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushNotificationPayload {
    pub provider: PushProvider,
    pub token: String,
    pub title: String,
    pub body: String,
    /// Deep-link data for the mobile client's notification-response handler
    /// (see apps/mobile's `NotificationsProvider`), e.g.
    /// `{"type": "follow:new", "actorUsername": "..."}`. FCM only accepts
    /// string values here (see `apps/notify/src/push/fcm.rs`), so keep this
    /// flat - one level of string/number/bool fields, no nesting.
    #[serde(default)]
    pub data: serde_json::Value,
}

/// Every job that can be dequeued from [`NOTIFY_QUEUE`]. A producer builds
/// one directly and calls [`NotifyJob::name`]/[`NotifyJob::data`] to enqueue
/// it; the consumer rebuilds one from the raw `(name, data)` BullMQ hands it
/// via [`NotifyJob::from_raw`].
#[derive(Debug, Clone)]
pub enum NotifyJob {
    AuthVerificationEmail(LinkEmailPayload),
    AuthDeleteAccountEmail(LinkEmailPayload),
    AuthResetPassword(LinkEmailPayload),
    AuthSignInOtpEmail(OtpEmailPayload),
    AuthVerificationOtpEmail(OtpEmailPayload),
    AuthPasswordResetOtpEmail(OtpEmailPayload),
    PushNotification(PushNotificationPayload),
}

impl NotifyJob {
    pub fn name(&self) -> &'static str {
        use job_names::*;
        match self {
            NotifyJob::AuthVerificationEmail(_) => AUTH_VERIFICATION_EMAIL,
            NotifyJob::AuthDeleteAccountEmail(_) => AUTH_DELETE_ACCOUNT_EMAIL,
            NotifyJob::AuthResetPassword(_) => AUTH_RESET_PASSWORD,
            NotifyJob::AuthSignInOtpEmail(_) => AUTH_SIGN_IN_OTP_EMAIL,
            NotifyJob::AuthVerificationOtpEmail(_) => AUTH_VERIFICATION_OTP_EMAIL,
            NotifyJob::AuthPasswordResetOtpEmail(_) => AUTH_PASSWORD_RESET_OTP_EMAIL,
            NotifyJob::PushNotification(_) => PUSH_NOTIFICATION,
        }
    }

    pub fn data(&self) -> serde_json::Value {
        match self {
            NotifyJob::AuthVerificationEmail(p)
            | NotifyJob::AuthDeleteAccountEmail(p)
            | NotifyJob::AuthResetPassword(p) => serde_json::to_value(p),
            NotifyJob::AuthSignInOtpEmail(p)
            | NotifyJob::AuthVerificationOtpEmail(p)
            | NotifyJob::AuthPasswordResetOtpEmail(p) => serde_json::to_value(p),
            NotifyJob::PushNotification(p) => serde_json::to_value(p),
        }
        .expect("NotifyJob payloads are always serializable")
    }

    /// `Ok(None)` means `name` isn't a job this contract knows about (the
    /// caller should log and skip, not fail the job).
    pub fn from_raw(
        name: &str,
        data: serde_json::Value,
    ) -> Result<Option<Self>, serde_json::Error> {
        use job_names::*;
        Ok(Some(match name {
            AUTH_VERIFICATION_EMAIL => {
                NotifyJob::AuthVerificationEmail(serde_json::from_value(data)?)
            }
            AUTH_DELETE_ACCOUNT_EMAIL => {
                NotifyJob::AuthDeleteAccountEmail(serde_json::from_value(data)?)
            }
            AUTH_RESET_PASSWORD => NotifyJob::AuthResetPassword(serde_json::from_value(data)?),
            AUTH_SIGN_IN_OTP_EMAIL => NotifyJob::AuthSignInOtpEmail(serde_json::from_value(data)?),
            AUTH_VERIFICATION_OTP_EMAIL => {
                NotifyJob::AuthVerificationOtpEmail(serde_json::from_value(data)?)
            }
            AUTH_PASSWORD_RESET_OTP_EMAIL => {
                NotifyJob::AuthPasswordResetOtpEmail(serde_json::from_value(data)?)
            }
            PUSH_NOTIFICATION => NotifyJob::PushNotification(serde_json::from_value(data)?),
            _ => return Ok(None),
        }))
    }
}
