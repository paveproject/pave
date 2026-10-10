//! OpenAPI documentation only - `/auth/otp/send` and `/auth/otp/verify` are
//! actually implemented and routed by `auth::OtpPlugin` (via better-auth-rs's
//! own router, nested at `/auth` in `main.rs`), not by axum handlers here.
//! `utoipa::path` only reads its attribute, never the function body, so
//! these stubs exist purely to get the two routes into `openapi.json` (and
//! from there, into the generated `@libs/api-js` SDK the mobile app calls).

use axum::Json;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct SendOtpRequest {
    pub email: String,
    /// `"en"` | `"fr"`, defaults to `"en"` when omitted.
    pub lang: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct SendOtpResponse {
    pub success: bool,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct VerifyOtpRequest {
    pub email: String,
    pub code: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct VerifyOtpResponse {
    /// Pass back as `Authorization: Bearer <token>` on every later request.
    pub token: String,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct SendChangeEmailOtpRequest {
    #[serde(rename = "newEmail")]
    pub new_email: String,
    /// `"en"` | `"fr"`, defaults to `"en"` when omitted.
    pub lang: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, ToSchema)]
pub struct VerifyChangeEmailOtpRequest {
    #[serde(rename = "newEmail")]
    pub new_email: String,
    pub code: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct VerifyChangeEmailOtpResponse {
    pub success: bool,
}

#[utoipa::path(
    post,
    path = "/auth/otp/send",
    tag = "Auth",
    request_body = SendOtpRequest,
    responses((status = 200, description = "Code sent", body = SendOtpResponse))
)]
#[allow(dead_code, reason = "referenced by ApiDoc's paths(), never actually called")]
pub async fn send_otp() -> Json<SendOtpResponse> {
    unreachable!("documentation only - routed by auth::OtpPlugin")
}

#[utoipa::path(
    post,
    path = "/auth/otp/verify",
    tag = "Auth",
    request_body = VerifyOtpRequest,
    responses((status = 200, description = "Signed in", body = VerifyOtpResponse))
)]
#[allow(dead_code, reason = "referenced by ApiDoc's paths(), never actually called")]
pub async fn verify_otp() -> Json<VerifyOtpResponse> {
    unreachable!("documentation only - routed by auth::OtpPlugin")
}

/// Requires a session (`Authorization: Bearer <token>`). Sends a code to the
/// *new* address, not the signed-in user's current one.
#[utoipa::path(
    post,
    path = "/auth/otp/change-email/send",
    tag = "Auth",
    request_body = SendChangeEmailOtpRequest,
    responses((status = 200, description = "Code sent to the new address", body = SendOtpResponse))
)]
#[allow(dead_code, reason = "referenced by ApiDoc's paths(), never actually called")]
pub async fn send_change_email_otp() -> Json<SendOtpResponse> {
    unreachable!("documentation only - routed by auth::OtpPlugin")
}

/// Requires a session (`Authorization: Bearer <token>`). Consumes the code
/// sent to the new address and updates the signed-in user's email in place.
#[utoipa::path(
    post,
    path = "/auth/otp/change-email/verify",
    tag = "Auth",
    request_body = VerifyChangeEmailOtpRequest,
    responses((status = 200, description = "Email changed", body = VerifyChangeEmailOtpResponse))
)]
#[allow(dead_code, reason = "referenced by ApiDoc's paths(), never actually called")]
pub async fn verify_change_email_otp() -> Json<VerifyChangeEmailOtpResponse> {
    unreachable!("documentation only - routed by auth::OtpPlugin")
}
