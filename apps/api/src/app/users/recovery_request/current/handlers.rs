use crate::app::access::authorize_user_scope;
use crate::app::recovery_requests::dto::MeRecoveryRequestsResponse;
use crate::app::recovery_requests::handlers::{
    fetch_contact_rows, tally, to_recovery_request_response,
};
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use db_rs::recovery_request;
use db_rs::sea_orm_active_enums::RecoveryRequestStatusEnum;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

/// What the requesting device polls after a restart, when it may have
/// forgotten the request's id but still needs to resume watching it.
#[utoipa::path(
    get,
    path = "/user/{user_id}/recovery-request/current",
    tag = "RecoveryRequests",
    params(("user_id" = String, Path, description = "Account being recovered")),
    responses(
        (status = 200, description = "That account's current pending recovery request", body = MeRecoveryRequestsResponse),
        (status = 404, description = "No pending recovery request, or not your account")
    )
)]
pub async fn get_current_recovery_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
) -> impl IntoResponse {
    if let Err(status) = authorize_user_scope(&session, &user_id) {
        return status.into_response();
    }

    let Some(model) = recovery_request::Entity::find()
        .filter(recovery_request::Column::OwnerUserId.eq(user_id))
        .filter(recovery_request::Column::Status.eq(RecoveryRequestStatusEnum::Pending))
        .one(&state.db)
        .await
        .expect("failed to query current recovery request")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let rows = fetch_contact_rows(&state.db, model.id).await;
    let (total, approved, declined) = tally(&rows);
    Json(to_recovery_request_response(
        model, total, approved, declined,
    ))
    .into_response()
}
