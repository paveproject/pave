use crate::app::data_access::requests::handlers::has_open_access;
use auth::AppAuthSchema;
use axum::http::StatusCode;
use better_auth::integrations::axum::CurrentSession;
use sea_orm::DatabaseConnection;

/// The **write** gate: only the user themselves, ever. A trusted contact with
/// an open grant reads through `authorize_user_read_scope` and never writes.
///
/// 404 rather than 403, here and in every `find_owned_*` helper: a 403 would
/// confirm a resource exists under that id.
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

/// The **read** gate: the user, or a trusted contact holding an open grant.
pub(crate) async fn authorize_user_read_scope(
    db: &DatabaseConnection,
    session: &CurrentSession<AppAuthSchema>,
    user_id: &str,
) -> Result<(), StatusCode> {
    if session.user.id == user_id {
        return Ok(());
    }
    if has_open_access(db, user_id, &session.user.id).await {
        return Ok(());
    }
    Err(StatusCode::NOT_FOUND)
}

/// The item-route counterpart, for handlers that resolve the owner from the
/// row rather than from the path.
pub(crate) async fn can_read_owner(
    db: &DatabaseConnection,
    session: &CurrentSession<AppAuthSchema>,
    owner_user_id: &str,
) -> bool {
    session.user.id == owner_user_id || has_open_access(db, owner_user_id, &session.user.id).await
}
