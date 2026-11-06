use crate::app::access::authorize_user_scope;
use crate::app::protest_sessions::dto::ProtestSessionResponse;
use crate::app::protest_sessions::handlers::{load_blobs, to_response};
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use db_rs::protest_session;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

#[utoipa::path(
    get,
    path = "/user/{user_id}/protest-sessions",
    tag = "ProtestSessions",
    params(("user_id" = String, Path, description = "Owner of the sessions")),
    responses(
        (status = 200, description = "That account's sessions", body = Vec<ProtestSessionResponse>),
        (status = 404, description = "Not your account")
    )
)]
pub async fn list_sessions(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
) -> impl IntoResponse {
    if let Err(status) = authorize_user_scope(&session, &user_id) {
        return status.into_response();
    }

    let sessions = protest_session::Entity::find()
        .filter(protest_session::Column::OwnerUserId.eq(user_id))
        .all(&state.db)
        .await;

    let sessions = match sessions {
        Ok(rows) => rows,
        Err(error) => {
            tracing::error!(?error, "failed to list protest sessions");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not list the sessions",
            )
                .into_response();
        }
    };

    let mut out = Vec::with_capacity(sessions.len());
    for row in sessions {
        let blobs = load_blobs(&state.db, row.id).await;
        out.push(to_response(row, blobs));
    }
    Json(out).into_response()
}
