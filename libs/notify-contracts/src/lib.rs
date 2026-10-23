//! Shared BullMQ contract between `api` (producer) and `notify` (consumer):
//! the queue name, every job name on it, and the exact payload shape for
//! each. Both sides depend on this crate so a payload change is a compile
//! error on whichever side wasn't updated, instead of a runtime mismatch.

use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

pub const NOTIFY_QUEUE: &str = "notify_queue";

pub mod job_names {
    pub const AUTH_VERIFICATION_EMAIL: &str = "auth:verification-email";
    pub const AUTH_DELETE_ACCOUNT_EMAIL: &str = "auth:delete-account-email";
    pub const AUTH_RESET_PASSWORD: &str = "auth:reset-password";
    pub const AUTH_SIGN_IN_OTP_EMAIL: &str = "auth:sign-in-otp-email";
    pub const AUTH_VERIFICATION_OTP_EMAIL: &str = "auth:verification-otp-email";
    pub const AUTH_PASSWORD_RESET_OTP_EMAIL: &str = "auth:password-reset-otp-email";
    pub const RECOVERY_REQUEST_CREATED_EMAIL: &str = "recovery-request:created-email";
    pub const RECOVERY_REQUEST_READY_EMAIL: &str = "recovery-request:ready-email";
    pub const RECOVERY_KEY_MNEMONIC_FETCHED_EMAIL: &str = "recovery-key-mnemonic:fetched-email";
    pub const RECOVERY_KEY_MNEMONIC_SET_EMAIL: &str = "recovery-key-mnemonic:set-email";
    pub const RECOVERY_KEY_MNEMONIC_ACTIVATED_EMAIL: &str = "recovery-key-mnemonic:activated-email";
    pub const PUSH_NOTIFICATION: &str = "push:notification";
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize, Default)]
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
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PushProvider {
    Fcm,
    Apns,
}

/// One notification kind per push-sending call site, carrying just the
/// variables its template needs - never pre-rendered text. `notify` owns
/// the actual copy (title/body, in every language), same as it already
/// does for the email jobs above; add a variant here, and a matching
/// dictionary entry under `apps/notify/src/assets/i18n`, the next time a
/// new call site needs to send a push.
///
/// This is also, verbatim, the `data` payload the device actually
/// receives over APNs/FCM (see `apps/notify/src/dispatch.rs`'s
/// `send_push_notification`, which serializes `content` directly) -
/// `ToSchema` lets `api` register it as an OpenAPI component with no path
/// of its own purely so the generated TS SDK carries the exact same type,
/// and the mobile `NotificationsProvider` can switch on `data.kind`
/// instead of hand-duplicating this enum's shape and drifting out of sync
/// with it. Fields are renamed individually to camelCase rather than via
/// a container-level `rename_all_fields` - utoipa 6.0.0's `ToSchema`
/// derive doesn't pick that attribute up, so the generated schema would
/// silently keep the snake_case Rust names otherwise (confirmed against
/// both serde's own output and utoipa's schema output directly).
#[derive(Debug, Clone, Serialize, Deserialize, ToSchema)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum PushContent {
    /// `actor_username` is `None` for a contact with no username set -
    /// `notify` substitutes its own translated "Someone" fallback, not a
    /// hardcoded-language one baked in by the producer.
    TrustedContactAccepted {
        #[serde(rename = "actorUsername")]
        actor_username: Option<String>,
    },
    /// Sent to every one of the owner's currently-accepted trusted
    /// contacts the moment a recovery request is created - asking them to
    /// release the Shamir share they're already holding.
    RecoveryRequestCreated {
        #[serde(rename = "ownerUsername")]
        owner_username: Option<String>,
    },
    /// Sent to the owner's requesting device each time a contact responds -
    /// carries running totals so the notification itself can say "2 of 3"
    /// without the device needing to be foregrounded to know that.
    /// `declined` is separate from `approved`/`total` (not derived as
    /// `total - approved`, since some contacts may still be `pending`) so
    /// the rendered text can distinguish "no one has answered yet" from
    /// "everyone answered, but declined."
    RecoveryRequestContactResponded {
        approved: u32,
        declined: u32,
        total: u32,
    },
    /// Sent to the owner's requesting device when every asked contact has
    /// responded and none approved - zero shares exist, so reconstruction
    /// is guaranteed impossible regardless of the (server-unknown) Shamir
    /// threshold. See `recovery_requests::handlers::fail_if_unrecoverable`.
    RecoveryRequestFailed,
    /// Sent to every one of this user's *other*, already-`active` devices
    /// the moment a new one registers and needs approval - see
    /// `devices::handlers::set_device`. Never sent to the new device
    /// itself (it has nothing to approve, including itself).
    DeviceApprovalRequested,
    /// Sent to the specific device that was just approved - see
    /// `devices::handlers::approve_device`.
    DeviceApproved,
    /// Sent to the specific device that was just declined, before its row
    /// is deleted - see `devices::handlers::decline_device`.
    DeviceDeclined,
    /// Sent to the requesting device the moment its recovery request's
    /// mandatory delay elapses - enqueued with a matching `delay` at
    /// `create_recovery_request` time, not triggered by anything watching
    /// the clock. Tells the owner it's worth opening the app again; the
    /// device's own background poll (`useRecoveryRequestCompletion`)
    /// handles the actual fetch-and-complete once it does, so this is
    /// purely a wake-up call, carrying no data of its own.
    RecoveryRequestReady,
}

/// Who a `PushNotifyPayload` goes to - resolved by `notify` itself (see
/// `apps/notify/src/recipients.rs`), never by the producer. `notify` has
/// its own database access specifically so `api` only ever has to say
/// *who* (in terms it already has in hand from the request it's handling)
/// and *what happened*, never a token, provider, or language.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum PushTarget {
    /// Every device of every one of these users - e.g. every currently-
    /// accepted trusted contact asked by one recovery request, notified
    /// with a single job instead of one per contact per token. A named
    /// field, not a bare newtype (`Users(Vec<String>)`) - internally
    /// tagged enums (`#[serde(tag = "kind")]`) can only ever merge the tag
    /// into a map, and a newtype wrapping a sequence has no map to merge
    /// it into - serde panics at serialize time for that shape, caught the
    /// hard way via `NotifyJob::data()`'s own `.expect(...)`.
    Users { user_ids: Vec<String> },
    /// One specific device only, resolved via `device.session_id` ==
    /// `push_token.session_id` correlation (both already kept fresh on
    /// every `PUT /me/devices` / `PUT /me/push-token` call).
    Device { user_id: String, device_id: String },
    /// Every one of this user's *other* already-`active` devices -
    /// excludes one specific device id (the one that just registered).
    OtherActiveDevices {
        user_id: String,
        excluding_device_id: String,
    },
}

/// One push notification, possibly many recipients/devices - `notify`
/// resolves `target` into tokens/providers/languages itself (see
/// `apps/notify/src/recipients.rs`), groups by `(provider, language)`, and
/// sends one batch per group. The producer (`apps/api`) never touches a
/// token, provider, or language - just `target` (ids it already has from
/// the request it's handling) and `content` (what happened).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushNotifyPayload {
    pub target: PushTarget,
    pub content: PushContent,
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
    /// The recovery-request safety net: sent to the account's registered
    /// email - a channel independent of whatever device/session the
    /// request itself was made from - the moment a recovery request is
    /// created, linking to the cancel endpoint. The server can't tell a
    /// legitimate re-login after really losing every device apart from an
    /// attacker who simply stole the session, so this goes out every time,
    /// not just when something looks suspicious.
    RecoveryRequestCreatedEmail(LinkEmailPayload),
    /// The "come back and finish" nudge - sent the moment the mandatory
    /// delay elapses, same independent-channel reasoning as the email
    /// above. Enqueued alongside `PushContent::RecoveryRequestReady` with
    /// a matching `delay`, not triggered by anything watching the clock.
    RecoveryRequestReadyEmail(LinkEmailPayload),
    /// The recovery-phrase path's only safety net: sent unconditionally on
    /// every fetch of the encrypted blob (`GET /me/recovery-key-mnemonic`),
    /// win or lose - the server can never verify the fetch actually led to
    /// a correct decrypt, so this is the one signal the real owner gets
    /// instead of the delay/quorum the trusted-contacts path has.
    RecoveryKeyMnemonicFetchedEmail(LinkEmailPayload),
    /// A device with an already-live session can silently overwrite the
    /// phrase's blob with one sealed to an attacker-chosen phrase, planting
    /// a backdoor with no other visible trace - same independent-channel
    /// reasoning as the fetch email above, sent on every `PUT`, not just
    /// ones that look suspicious.
    RecoveryKeyMnemonicSetEmail(LinkEmailPayload),
    /// `activate_via_recovery_key_mnemonic`'s own notification - until this
    /// existed, the owner only ever heard about an activation because the
    /// mobile client happens to call `GET` (which emails) immediately
    /// before `POST .../activate`. That's a client-side habit, not a
    /// server-side guarantee, so this fires unconditionally from the
    /// activation itself.
    RecoveryKeyMnemonicActivatedEmail(LinkEmailPayload),
    PushNotification(PushNotifyPayload),
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
            NotifyJob::RecoveryRequestCreatedEmail(_) => RECOVERY_REQUEST_CREATED_EMAIL,
            NotifyJob::RecoveryRequestReadyEmail(_) => RECOVERY_REQUEST_READY_EMAIL,
            NotifyJob::RecoveryKeyMnemonicFetchedEmail(_) => RECOVERY_KEY_MNEMONIC_FETCHED_EMAIL,
            NotifyJob::RecoveryKeyMnemonicSetEmail(_) => RECOVERY_KEY_MNEMONIC_SET_EMAIL,
            NotifyJob::RecoveryKeyMnemonicActivatedEmail(_) => {
                RECOVERY_KEY_MNEMONIC_ACTIVATED_EMAIL
            }
            NotifyJob::PushNotification(_) => PUSH_NOTIFICATION,
        }
    }

    pub fn data(&self) -> serde_json::Value {
        match self {
            NotifyJob::AuthVerificationEmail(p)
            | NotifyJob::AuthDeleteAccountEmail(p)
            | NotifyJob::AuthResetPassword(p)
            | NotifyJob::RecoveryRequestCreatedEmail(p)
            | NotifyJob::RecoveryRequestReadyEmail(p)
            | NotifyJob::RecoveryKeyMnemonicFetchedEmail(p)
            | NotifyJob::RecoveryKeyMnemonicSetEmail(p)
            | NotifyJob::RecoveryKeyMnemonicActivatedEmail(p) => serde_json::to_value(p),
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
            RECOVERY_REQUEST_CREATED_EMAIL => {
                NotifyJob::RecoveryRequestCreatedEmail(serde_json::from_value(data)?)
            }
            RECOVERY_REQUEST_READY_EMAIL => {
                NotifyJob::RecoveryRequestReadyEmail(serde_json::from_value(data)?)
            }
            RECOVERY_KEY_MNEMONIC_FETCHED_EMAIL => {
                NotifyJob::RecoveryKeyMnemonicFetchedEmail(serde_json::from_value(data)?)
            }
            RECOVERY_KEY_MNEMONIC_SET_EMAIL => {
                NotifyJob::RecoveryKeyMnemonicSetEmail(serde_json::from_value(data)?)
            }
            RECOVERY_KEY_MNEMONIC_ACTIVATED_EMAIL => {
                NotifyJob::RecoveryKeyMnemonicActivatedEmail(serde_json::from_value(data)?)
            }
            PUSH_NOTIFICATION => NotifyJob::PushNotification(serde_json::from_value(data)?),
            _ => return Ok(None),
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Regression test for `PushTarget::Users(Vec<String>)` panicking at
    /// `NotifyJob::data()`'s `.expect(...)` - a newtype variant wrapping a
    /// sequence has no map for an internally-tagged enum's `kind` field to
    /// merge into, so serde refuses to serialize it at all. Every variant
    /// must round-trip through `data()`/`from_raw()` exactly like a real
    /// producer -> queue -> consumer hop would.
    #[test]
    fn push_target_variants_round_trip() {
        let targets = [
            PushTarget::Users {
                user_ids: vec!["u1".to_string(), "u2".to_string()],
            },
            PushTarget::Device {
                user_id: "u1".to_string(),
                device_id: "d1".to_string(),
            },
            PushTarget::OtherActiveDevices {
                user_id: "u1".to_string(),
                excluding_device_id: "d1".to_string(),
            },
        ];

        for target in targets {
            let job = NotifyJob::PushNotification(PushNotifyPayload {
                target,
                content: PushContent::DeviceApproved,
            });
            let data = job.data();
            let rebuilt =
                NotifyJob::from_raw(job.name(), data).expect("push notification job must parse");
            assert!(matches!(rebuilt, Some(NotifyJob::PushNotification(_))));
        }
    }
}
