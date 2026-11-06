use auth::AppAuthSchema;
use axum::http::StatusCode;
use better_auth::integrations::axum::CurrentSession;

/// May the caller act on `user_id`'s data?
///
/// Today: only the user themselves. This is the **single** extension point for
/// trusted-contact access - a contact holding a completed recovery for that
/// account will be allowed here, and nowhere else.
///
/// 404 rather than 403, here and in every `find_owned_*` helper: a 403 would
/// confirm that an account or a resource exists under that id.
pub(crate) fn authorize_user_scope(
    session: &CurrentSession<AppAuthSchema>,
    user_id: &str,
) -> Result<(), StatusCode> {
    if session.user.id == user_id {
        Ok(())
    } else {
        Err(StatusCode::NOT_FOUND)
    }
}
