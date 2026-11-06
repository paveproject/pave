use crate::app::access::authorize_user_scope;
use crate::app::trusted_contacts::dto::{
    MeTrustedContactsAsContactQuery, MeTrustedContactsAsContactResponse,
};
use crate::app::trusted_contacts::handlers::profiles_for;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Path, Query, State};
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use db_rs::sea_orm_active_enums::TrustedContactStatusEnum;
use db_rs::trusted_contact;
use db_rs::trusted_contact_share;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use std::collections::HashMap;
use uuid::Uuid;

#[utoipa::path(
    get,
    path = "/user/{user_id}/trusted-contact/of",
    tag = "TrustedContacts",
    params(("user_id" = String, Path, description = "Account acting as the contact"), MeTrustedContactsAsContactQuery),
    responses(
        (status = 200, description = "People whose safety net that account is part of", body = Vec<MeTrustedContactsAsContactResponse>),
        (status = 404, description = "Not your account")
    )
)]
pub async fn list_as_contact(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(user_id): Path<String>,
    Query(query): Query<MeTrustedContactsAsContactQuery>,
) -> impl IntoResponse {
    if let Err(status) = authorize_user_scope(&session, &user_id) {
        return status.into_response();
    }

    let rows = trusted_contact::Entity::find()
        .filter(trusted_contact::Column::ContactUserId.eq(user_id))
        .filter(trusted_contact::Column::Status.eq(TrustedContactStatusEnum::Accepted))
        .all(&state.db)
        .await
        .expect("failed to query trusted-by relationships");

    let owner_ids: Vec<String> = rows.iter().map(|r| r.owner_user_id.clone()).collect();
    let device_id = query
        .device_id
        .as_deref()
        .and_then(|id| Uuid::parse_str(id).ok());
    let trusted_contact_ids: Vec<Uuid> = rows.iter().map(|r| r.id).collect();

    // Independent of each other - run concurrently. Each row's one
    // relevant share (sealed for *this* device specifically) lives in
    // `trusted_contact_share`, not a column on `trusted_contact` itself,
    // resolved in one batched query keyed by relationship id.
    let profiles_future = profiles_for(&state.db, owner_ids, &state.config);
    let shares_future = async {
        match device_id {
            Some(device_id) => trusted_contact_share::Entity::find()
                .filter(trusted_contact_share::Column::TrustedContactId.is_in(trusted_contact_ids))
                .filter(trusted_contact_share::Column::DeviceId.eq(device_id))
                .all(&state.db)
                .await
                .expect("failed to query trusted contact shares"),
            None => Vec::new(),
        }
    };
    let (profiles, share_rows) = tokio::join!(profiles_future, shares_future);
    let mut shares_by_trusted_contact: HashMap<Uuid, String> = share_rows
        .into_iter()
        .map(|row| (row.trusted_contact_id, row.encrypted_share))
        .collect();

    Json(
        rows.into_iter()
            .map(|row| MeTrustedContactsAsContactResponse {
                encrypted_share: shares_by_trusted_contact.remove(&row.id),
                id: row.id.to_string(),
                status: row.status.into(),
                owner: profiles
                    .get(&row.owner_user_id)
                    .cloned()
                    .expect("owner profile missing for an accepted trusted-contact row"),
                created_at: row.created_at.to_rfc3339(),
            })
            .collect::<Vec<_>>(),
    )
    .into_response()
}
