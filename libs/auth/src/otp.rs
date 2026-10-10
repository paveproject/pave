//! Custom passwordless email-OTP plugin, built directly on better-auth-rs's
//! public plugin-authoring surface (`AuthPlugin`, `AuthStore`) rather than a
//! built-in plugin - the crate ships no standalone passwordless-OTP plugin,
//! only `TwoFactorPlugin`'s OTP as a *second* factor on top of a password.
//!
//! One identity per email: `/otp/send` always issues a code, and
//! `/otp/verify` signs in the existing user for that email or creates one on
//! the spot - there is no separate sign-up step.
//!
//! Sending the email itself is out of scope here (would otherwise couple
//! this library to Redis/BullMQ); the plugin just hands the generated code
//! to an injected [`OtpEmailSender`].

use async_trait::async_trait;
use better_auth::plugin::AuthContext;
use better_auth::prelude::{
    AuthRequest, AuthResponse, AuthSession, AuthUser, CreateAccount, CreateSession, CreateUser,
    CreateVerification, UpdateUser, UserView,
};
use better_auth::store::transaction;
use better_auth::{AuthError, AuthResult, AuthSchema};
use chrono::{Duration, Utc};
use rand::Rng;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use validator::Validate;

const OTP_LENGTH: u32 = 6;
const OTP_TTL_MINUTES: i64 = 10;
const ACCOUNT_PROVIDER_ID: &str = "email-otp";

/// What a code is being sent for - lets the implementation (in `apps/api`)
/// pick a visually/textually distinct email template, so a sign-in code and
/// a change-email confirmation never look identical in an inbox.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OtpPurpose {
    SignIn,
    ChangeEmail,
}

/// Delivers a generated code to the user. The implementation (in `apps/api`)
/// owns how that happens - enqueueing a notify job, calling an email API
/// directly, etc. - which this crate deliberately knows nothing about.
#[async_trait]
pub trait OtpEmailSender: Send + Sync {
    async fn send_otp(&self, email: &str, otp: &str, lang: &str, purpose: OtpPurpose)
        -> AuthResult<()>;
}

pub struct OtpPlugin {
    sender: Arc<dyn OtpEmailSender>,
}

impl OtpPlugin {
    pub fn new(sender: Arc<dyn OtpEmailSender>) -> Self {
        Self { sender }
    }
}

#[derive(Debug, Deserialize, Validate)]
struct SendOtpRequest {
    #[validate(email(message = "Invalid email address"))]
    email: String,
    lang: Option<String>,
}

#[derive(Debug, Serialize)]
struct SendOtpResponse {
    success: bool,
}

#[derive(Debug, Deserialize, Validate)]
struct VerifyOtpRequest {
    #[validate(email(message = "Invalid email address"))]
    email: String,
    #[validate(length(equal = 6, message = "Code must be 6 digits"))]
    code: String,
}

#[derive(Debug, Serialize)]
struct VerifyOtpResponse {
    token: String,
    user: UserView,
}

#[derive(Debug, Deserialize, Validate)]
struct SendChangeEmailOtpRequest {
    #[serde(rename = "newEmail")]
    #[validate(email(message = "Invalid email address"))]
    new_email: String,
    lang: Option<String>,
}

#[derive(Debug, Deserialize, Validate)]
struct VerifyChangeEmailOtpRequest {
    #[serde(rename = "newEmail")]
    #[validate(email(message = "Invalid email address"))]
    new_email: String,
    #[validate(length(equal = 6, message = "Code must be 6 digits"))]
    code: String,
}

#[derive(Debug, Serialize)]
struct VerifyChangeEmailOtpResponse {
    success: bool,
}

/// Namespaced so a change-email code can never be replayed against
/// `/otp/verify` (sign-in) for the same address, and vice versa.
fn change_email_identifier(new_email: &str) -> String {
    format!("change-email:{new_email}")
}

fn generate_otp() -> String {
    let max = 10u32.pow(OTP_LENGTH);
    format!(
        "{value:0width$}",
        value = rand::rng().random_range(0..max),
        width = OTP_LENGTH as usize
    )
}

impl OtpPlugin {
    async fn handle_send(
        &self,
        req: &AuthRequest,
        ctx: &AuthContext<impl AuthSchema>,
    ) -> AuthResult<AuthResponse> {
        let body: SendOtpRequest =
            match better_auth::__private_core::error::validate_request_body(req) {
                Ok(v) => v,
                Err(resp) => return Ok(resp),
            };
        let email = body.email.to_lowercase();
        let lang = body.lang.unwrap_or_else(|| "en".to_string());

        let otp = generate_otp();
        ctx.database
            .create_verification(CreateVerification {
                identifier: email.clone(),
                value: otp.clone(),
                expires_at: Utc::now() + Duration::minutes(OTP_TTL_MINUTES),
            })
            .await?;

        self.sender
            .send_otp(&email, &otp, &lang, OtpPurpose::SignIn)
            .await?;

        Ok(AuthResponse::json(200, &SendOtpResponse { success: true })?)
    }

    async fn handle_verify(
        &self,
        _req: &AuthRequest,
        ctx: &AuthContext<impl AuthSchema>,
    ) -> AuthResult<AuthResponse> {
        let body: VerifyOtpRequest =
            match better_auth::__private_core::error::validate_request_body(_req) {
                Ok(v) => v,
                Err(resp) => return Ok(resp),
            };
        let email = body.email.to_lowercase();

        let consumed = ctx
            .database
            .consume_verification(&email, &body.code)
            .await?;
        if consumed.is_none() {
            return Err(AuthError::UnprocessableEntity(
                "Invalid or expired code".to_string(),
            ));
        }

        let expires_in = ctx.config.session.expires_in;
        let database = ctx.database.clone();

        // Checked outside any transaction first, since this is the common
        // path (every returning user). The previous version always tried
        // `tx.create_user()` first and, on failure, kept issuing further
        // commands on that same `tx` to recover - but Postgres aborts a
        // transaction on its first failed statement, so every one of those
        // follow-up commands failed with "current transaction is aborted",
        // breaking sign-in for every user past their very first verify.
        let (user, token) = if let Some(user) = database.get_user_by_email(&email).await? {
            if database.get_user_accounts(&user.id()).await?.is_empty() {
                database
                    .create_account(CreateAccount {
                        user_id: user.id().to_string(),
                        account_id: user.id().to_string(),
                        provider_id: ACCOUNT_PROVIDER_ID.to_string(),
                        access_token: None,
                        refresh_token: None,
                        id_token: None,
                        access_token_expires_at: None,
                        refresh_token_expires_at: None,
                        scope: None,
                        password: None,
                    })
                    .await?;
            }

            let session = database
                .create_session(CreateSession {
                    user_id: user.id().to_string(),
                    expires_at: Utc::now() + expires_in,
                    ip_address: None,
                    user_agent: None,
                    impersonated_by: None,
                    active_organization_id: None,
                })
                .await?;
            (user, session.token().to_string())
        } else {
            // Genuinely new signup - create the user, account and session
            // atomically. A concurrent first-time verify for the same email
            // can still race here; on that failure the transaction is
            // already rolled back, so recovering with a plain read and a
            // non-transactional `create_session` (rather than reusing the
            // now-aborted `tx`) is safe.
            let email_for_tx = email.clone();
            let create_result = transaction(database.as_ref(), move |tx| {
                let email = email_for_tx.clone();
                Box::pin(async move {
                    let user = tx
                        .create_user(
                            CreateUser::new()
                                .with_email(&email)
                                .with_email_verified(true),
                        )
                        .await?;

                    tx.create_account(CreateAccount {
                        user_id: user.id().to_string(),
                        account_id: user.id().to_string(),
                        provider_id: ACCOUNT_PROVIDER_ID.to_string(),
                        access_token: None,
                        refresh_token: None,
                        id_token: None,
                        access_token_expires_at: None,
                        refresh_token_expires_at: None,
                        scope: None,
                        password: None,
                    })
                    .await?;

                    let session = tx
                        .create_session(CreateSession {
                            user_id: user.id().to_string(),
                            expires_at: Utc::now() + expires_in,
                            ip_address: None,
                            user_agent: None,
                            impersonated_by: None,
                            active_organization_id: None,
                        })
                        .await?;
                    let token = session.token().to_string();

                    Ok((user, token))
                })
            })
            .await;

            match create_result {
                Ok(result) => result,
                Err(AuthError::Database(_)) => {
                    let user = database
                        .get_user_by_email(&email)
                        .await?
                        .ok_or(AuthError::UserNotFound)?;
                    let session = database
                        .create_session(CreateSession {
                            user_id: user.id().to_string(),
                            expires_at: Utc::now() + expires_in,
                            ip_address: None,
                            user_agent: None,
                            impersonated_by: None,
                            active_organization_id: None,
                        })
                        .await?;
                    (user, session.token().to_string())
                }
                Err(error) => return Err(error),
            }
        };

        // Mobile-only API, no browser session to speak of - a `Set-Cookie`
        // here would just sit in the device's native HTTP cookie jar
        // (iOS/Android's `fetch` persists cookies regardless of the app's
        // own Bearer-token bookkeeping) and keep authenticating `/me`
        // requests even after `clearSessionToken()` wipes the token from
        // SecureStore, which is exactly what made sign-out look like it
        // briefly worked and then bounced back to signed-in.
        let response = VerifyOtpResponse {
            token: token.clone(),
            user: UserView::from(&user),
        };
        Ok(AuthResponse::json(200, &response)?)
    }

    /// `POST /otp/change-email/send` - requires a session. Sends a code to
    /// the *new* address rather than the signed-in user's current one, so
    /// the change also proves the caller controls the new mailbox.
    async fn handle_send_change_email(
        &self,
        req: &AuthRequest,
        ctx: &AuthContext<impl AuthSchema>,
    ) -> AuthResult<AuthResponse> {
        let (user, _session) = ctx.require_session(req).await?;
        let body: SendChangeEmailOtpRequest =
            match better_auth::__private_core::error::validate_request_body(req) {
                Ok(v) => v,
                Err(resp) => return Ok(resp),
            };
        let new_email = body.new_email.to_lowercase();
        let lang = body.lang.unwrap_or_else(|| "en".to_string());

        if user.email().map(|email| email == new_email).unwrap_or(false) {
            return Err(AuthError::bad_request("Email is the same"));
        }
        if ctx.database.get_user_by_email(&new_email).await?.is_some() {
            return Err(AuthError::UnprocessableEntity(
                "Email already in use".to_string(),
            ));
        }

        let otp = generate_otp();
        ctx.database
            .create_verification(CreateVerification {
                identifier: change_email_identifier(&new_email),
                value: otp.clone(),
                expires_at: Utc::now() + Duration::minutes(OTP_TTL_MINUTES),
            })
            .await?;

        self.sender
            .send_otp(&new_email, &otp, &lang, OtpPurpose::ChangeEmail)
            .await?;

        Ok(AuthResponse::json(200, &SendOtpResponse { success: true })?)
    }

    /// `POST /otp/change-email/verify` - requires a session. Consumes the
    /// code sent to the new address, then updates the signed-in user's email
    /// in place (no new session/token - the caller is already signed in).
    async fn handle_verify_change_email(
        &self,
        req: &AuthRequest,
        ctx: &AuthContext<impl AuthSchema>,
    ) -> AuthResult<AuthResponse> {
        let (user, _session) = ctx.require_session(req).await?;
        let body: VerifyChangeEmailOtpRequest =
            match better_auth::__private_core::error::validate_request_body(req) {
                Ok(v) => v,
                Err(resp) => return Ok(resp),
            };
        let new_email = body.new_email.to_lowercase();

        let consumed = ctx
            .database
            .consume_verification(&change_email_identifier(&new_email), &body.code)
            .await?;
        if consumed.is_none() {
            return Err(AuthError::UnprocessableEntity(
                "Invalid or expired code".to_string(),
            ));
        }

        // Re-check: another account could have claimed this address while
        // the code was pending.
        if ctx.database.get_user_by_email(&new_email).await?.is_some() {
            return Err(AuthError::UnprocessableEntity(
                "Email already in use".to_string(),
            ));
        }

        ctx.database
            .update_user(
                &user.id(),
                UpdateUser {
                    email: Some(new_email),
                    email_verified: Some(true),
                    ..Default::default()
                },
            )
            .await?;

        let response = VerifyChangeEmailOtpResponse { success: true };
        Ok(AuthResponse::json(200, &response)?)
    }
}

better_auth::__private_core::impl_auth_plugin! {
    OtpPlugin, "otp";
    routes {
        post "/otp/send" => handle_send, "send_otp";
        post "/otp/verify" => handle_verify, "verify_otp";
        post "/otp/change-email/send" => handle_send_change_email, "send_change_email_otp";
        post "/otp/change-email/verify" => handle_verify_change_email, "verify_change_email_otp";
    }
}

impl std::fmt::Debug for OtpPlugin {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("OtpPlugin").finish()
    }
}
