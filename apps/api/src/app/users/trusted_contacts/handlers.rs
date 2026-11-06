use crate::app::access::authorize_user_scope;
use crate::app::trusted_contacts::dto::MeTrustedContactsResponse;
use crate::app::trusted_contacts::handlers::profiles_for;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, State};
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use db_rs::trusted_contact;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

#[utoipa::path(
    get,
    path = "/user/{user_id}/trusted-contacts",
    tag = "TrustedContacts",
    params(("user_id" = String, Path, description = "Account whose contacts to list")),
    responses(
        (status = 200, description = "Contacts that account has designated", body = Vec<MeTrustedContactsResponse>),
        (status = 404, description = "Not your account")
    )
)]
pub async fn list_trusted_contacts(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
) -> impl IntoResponse {
    if let Err(status) = authorize_user_scope(&session, &user_id) {
        return status.into_response();
    }

    let rows = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::OwnerUserId.eq(user_id))
        .all(&state.db)
        .await
        .expect("failed to query trusted contacts");

    let contact_ids: Vec<String> = rows
        .iter()
        .filter_map(|r| r.contact_user_id.clone())
        .collect();
    let profiles = profiles_for(&state.db, contact_ids, &state.config).await;

    Json(
        rows.into_iter()
            .map(|row| MeTrustedContactsResponse {
                id: row.id.to_string(),
                status: row.status.into(),
                contact: row
                    .contact_user_id
                    .as_ref()
                    .and_then(|id| profiles.get(id).cloned()),
                created_at: row.created_at.to_rfc3339(),
            })
            .collect::<Vec<_>>(),
    )
    .into_response()
}
