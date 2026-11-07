use crate::app::access::authorize_user_scope;
use crate::app::data_access::requests::dto::DataAccessRequestResponse;
use crate::app::data_access::requests::handlers::{load_contact_rows, to_response};
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use db_rs::data_access_request;
use db_rs::sea_orm_active_enums::DataAccessRequestStatusEnum;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

/// The live request against this account, for the owner to see and refuse.
///
/// Owner-only on purpose: a requester watches their *own* request through
/// `GET /data-access/request/{id}`, which they hold the id of. Listing what is
/// pending against an account is the owner's business.
#[utoipa::path(
    get,
    path = "/user/{user_id}/data-access/request/current",
    tag = "DataAccessRequests",
    params(("user_id" = String, Path, description = "Account the request is against")),
    responses(
        (status = 200, description = "The live request", body = DataAccessRequestResponse),
        (status = 404, description = "No live request, or not your account")
    )
)]
pub async fn get_current_data_access_request(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
) -> impl IntoResponse {
    if let Err(status) = authorize_user_scope(&session, &user_id) {
        return status.into_response();
    }

    let Some(request) = data_access_request::Entity::find()
        .filter(data_access_request::Column::OwnerUserId.eq(user_id))
        .filter(data_access_request::Column::Status.eq(DataAccessRequestStatusEnum::Pending))
        .one(&state.db)
        .await
        .expect("failed to query the current data access request")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let rows = load_contact_rows(&state.db, request.id).await;
    Json(to_response(&state, request, &rows).await).into_response()
}
