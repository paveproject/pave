use crate::app::data_access::requests::dto::DataAccessRequestResponse;
use crate::app::data_access::requests::handlers::{load_contact_rows, to_response};
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use db_rs::data_access_request;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter, QueryOrder};

/// Requests the caller has made, newest first - their side of the story.
/// Under `/me` because "the ones I asked for" has no sense addressed by an id.
#[utoipa::path(
    get,
    path = "/me/data-access/requests",
    tag = "DataAccessRequests",
    responses((status = 200, description = "Requests the caller has made", body = Vec<DataAccessRequestResponse>))
)]
pub async fn list_my_data_access_requests(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let requests = data_access_request::Entity::find()
        .filter(data_access_request::Column::RequesterUserId.eq(session.user.id.clone()))
        .order_by_desc(data_access_request::Column::CreatedAt)
        .all(&state.db)
        .await
        .expect("failed to query the caller's data access requests");

    let mut out = Vec::with_capacity(requests.len());
    for request in requests {
        let rows = load_contact_rows(&state.db, request.id).await;
        out.push(to_response(&state, request, &rows).await);
    }
    Json(out)
}
