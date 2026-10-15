//! OpenAPI documentation only - `/auth/otp/send` and `/auth/otp/verify` are
//! actually implemented and routed by `auth::OtpPlugin` (via better-auth-rs's
//! own router, nested at `/auth` in `main.rs`), not by axum handlers here.
//! `utoipa::path` only reads its attribute, never the function body, so
//! these stubs exist purely to get the two routes into `openapi.json` (and
//! from there, into the generated `@libs/api-js` SDK the mobile app calls).

use axum::Json;
use serde::{Deserialize, Serialize};
use utoipa::{OpenApi, ToSchema};

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct AuthOtpSendRequest {
    pub email: String,
    /// `"en-US"` | `"fr-FR"`, defaults to `"en-US"` when omitted.
    pub lang: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuthOtpSendResponse {
    pub success: bool,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct AuthOtpVerifyRequest {
    pub email: String,
    pub code: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuthOtpVerifyResponse {
    /// Pass back as `Authorization: Bearer <token>` on every later request.
    pub token: String,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct AuthOtpSendChangeEmailRequest {
    #[serde(rename = "newEmail")]
    pub new_email: String,
    /// `"en-US"` | `"fr-FR"`, defaults to `"en-US"` when omitted.
    pub lang: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct AuthOtpVerifyChangeEmailRequest {
    #[serde(rename = "newEmail")]
    pub new_email: String,
    pub code: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AuthOtpVerifyChangeEmailResponse {
    pub success: bool,
}

#[utoipa::path(
    post,
    path = "/auth/otp/send",
    tag = "Auth",
    request_body = AuthOtpSendRequest,
    responses((status = 200, description = "Code sent", body = AuthOtpSendResponse))
)]
#[allow(
    dead_code,
    reason = "referenced by ApiDoc's paths(), never actually called"
)]
pub async fn send_otp() -> Json<AuthOtpSendResponse> {
    unreachable!("documentation only - routed by auth::OtpPlugin")
}

#[utoipa::path(
    post,
    path = "/auth/otp/verify",
    tag = "Auth",
    request_body = AuthOtpVerifyRequest,
    responses((status = 200, description = "Signed in", body = AuthOtpVerifyResponse))
)]
#[allow(
    dead_code,
    reason = "referenced by ApiDoc's paths(), never actually called"
)]
pub async fn verify_otp() -> Json<AuthOtpVerifyResponse> {
    unreachable!("documentation only - routed by auth::OtpPlugin")
}

/// Requires a session (`Authorization: Bearer <token>`). Sends a code to the
/// *new* address, not the signed-in user's current one.
#[utoipa::path(
    post,
    path = "/auth/otp/change-email/send",
    tag = "Auth",
    request_body = AuthOtpSendChangeEmailRequest,
    responses((status = 200, description = "Code sent to the new address", body = AuthOtpSendResponse))
)]
#[allow(
    dead_code,
    reason = "referenced by ApiDoc's paths(), never actually called"
)]
pub async fn send_change_email_otp() -> Json<AuthOtpSendResponse> {
    unreachable!("documentation only - routed by auth::OtpPlugin")
}

/// Requires a session (`Authorization: Bearer <token>`). Consumes the code
/// sent to the new address and updates the signed-in user's email in place.
#[utoipa::path(
    post,
    path = "/auth/otp/change-email/verify",
    tag = "Auth",
    request_body = AuthOtpVerifyChangeEmailRequest,
    responses((status = 200, description = "Email changed", body = AuthOtpVerifyChangeEmailResponse))
)]
#[allow(
    dead_code,
    reason = "referenced by ApiDoc's paths(), never actually called"
)]
pub async fn verify_change_email_otp() -> Json<AuthOtpVerifyChangeEmailResponse> {
    unreachable!("documentation only - routed by auth::OtpPlugin")
}

/// This module's own slice of the OpenAPI doc - merged into the top-level
/// one in `main.rs`, so adding a path/schema here never requires touching
/// that file.
#[derive(OpenApi)]
#[openapi(
    paths(send_otp, verify_otp, send_change_email_otp, verify_change_email_otp),
    components(schemas(
        AuthOtpSendRequest,
        AuthOtpSendResponse,
        AuthOtpVerifyRequest,
        AuthOtpVerifyResponse,
        AuthOtpSendChangeEmailRequest,
        AuthOtpVerifyChangeEmailRequest,
        AuthOtpVerifyChangeEmailResponse
    ))
)]
pub struct ApiDoc;
