//! The scalable "things waiting for my approval" inbox: one aggregating
//! handler (not a new table) over every kind of approval this account
//! might owe someone else a tap on. Adding a future third kind is purely
//! additive - one more query branch here, one more `MePendingAction`
//! variant.
//!
//! Fetched on app launch, kept live via `useUserEventsSocket`, and
//! refetched on every app refocus for free via react-query's
//! `focusManager`.

use super::dto::MePendingAction;
use crate::app::data_access::requests::handlers::{
    close_if_expired, load_contact_rows, to_contact_response as data_access_contact_response,
    to_response as data_access_response,
};
use crate::app::devices::dto::{MeDevicesResponse, MeOwnDeviceRegistrationResponse};
use crate::app::devices::handlers::{resolve_active_caller_device, to_device_response};
use crate::app::recovery_requests::handlers::to_pending_contact_response;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::State;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use db_rs::data_access_request;
use db_rs::data_access_request_contact;
use db_rs::device;
use db_rs::recovery_request;
use db_rs::recovery_request_contact;
use db_rs::sea_orm_active_enums::{
    DataAccessRequestContactStatusEnum, DataAccessRequestStatusEnum, DeviceStatusEnum,
    RecoveryRequestContactStatusEnum, RecoveryRequestStatusEnum,
};
use db_rs::trusted_contact;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
use std::collections::HashMap;
use uuid::Uuid;

#[utoipa::path(
    get,
    path = "/me/pending-actions",
    tag = "Me",
    responses((status = 200, description = "Things waiting for the caller's approval", body = Vec<MePendingAction>))
)]
pub async fn get_pending_actions(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();
    let mut actions = Vec::new();

    // Four independent lookups, resolved concurrently. The pending devices
    // are split below by whether each *is* the caller's own session: a device
    // can't approve its own registration, only an `active` sibling can.
    let (device_rows, caller_is_active, my_contact_rows, requests_on_my_data) = tokio::join!(
        device::Entity::find()
            .filter(device::Column::UserId.eq(user_id.clone()))
            .filter(device::Column::Status.eq(DeviceStatusEnum::Pending))
            .all(&state.db),
        resolve_active_caller_device(&state.db, &user_id, &session.session.id),
        trusted_contact::Entity::find()
            .filter(trusted_contact::Column::ContactUserId.eq(user_id.clone()))
            .all(&state.db),
        data_access_request::Entity::find()
            .filter(data_access_request::Column::OwnerUserId.eq(user_id.clone()))
            .filter(data_access_request::Column::Status.eq(DataAccessRequestStatusEnum::Pending))
            .all(&state.db),
    );
    let (own_pending, pending_devices): (Vec<_>, Vec<_>) = device_rows
        .expect("failed to query pending devices")
        .into_iter()
        .partition(|row| row.session_id == session.session.id);
    let caller_is_active = caller_is_active.is_some();
    let my_contact_rows = my_contact_rows.expect("failed to query trusted contact relationships");

    // Only an `active` caller can ever actually approve/decline one of
    // these - a still-`pending` caller would otherwise be shown a button
    // that 403s the instant it's tapped. If the caller isn't active,
    // every sibling pending device just doesn't show up here at all.
    if caller_is_active {
        for row in pending_devices {
            actions.push(MePendingAction::DeviceRegistration(MeDevicesResponse {
                id: row.id.to_string(),
                public_key: row.public_key,
                device_type: row.device_type.into(),
                status: row.status.into(),
                encrypted_dek: row.encrypted_dek,
                location_city: row.location_city,
                location_country: row.location_country,
                created_at: row.created_at.to_rfc3339(),
                updated_at: row.updated_at.to_rfc3339(),
            }));
        }
    }

    if let Some(own) = own_pending.into_iter().next() {
        let approver_devices = device::Entity::find()
            .filter(device::Column::UserId.eq(user_id.clone()))
            .filter(device::Column::Status.eq(DeviceStatusEnum::Active))
            .all(&state.db)
            .await
            .expect("failed to query approver devices")
            .into_iter()
            .map(to_device_response)
            .collect();

        actions.push(MePendingAction::OwnDeviceRegistration(
            MeOwnDeviceRegistrationResponse {
                id: own.id.to_string(),
                device_type: own.device_type.into(),
                approver_devices,
                created_at: own.created_at.to_rfc3339(),
                updated_at: own.updated_at.to_rfc3339(),
            },
        ));
    }

    // Two batched lookups instead of two queries *per* trusted-contact
    // relationship - this used to cost up to 2N round trips for a user
    // who's a contact for N different owners.
    let trusted_contact_ids: Vec<Uuid> = my_contact_rows.iter().map(|c| c.id).collect();
    let pending_contact_rows = recovery_request_contact::Entity::find()
        .filter(recovery_request_contact::Column::TrustedContactId.is_in(trusted_contact_ids))
        .filter(
            recovery_request_contact::Column::Status.eq(RecoveryRequestContactStatusEnum::Pending),
        )
        .all(&state.db)
        .await
        .expect("failed to query recovery request contact rows");
    let request_ids: Vec<Uuid> = pending_contact_rows
        .iter()
        .map(|r| r.recovery_request_id)
        .collect();
    let requests_by_id: HashMap<Uuid, recovery_request::Model> = recovery_request::Entity::find()
        .filter(recovery_request::Column::Id.is_in(request_ids))
        .filter(recovery_request::Column::Status.eq(RecoveryRequestStatusEnum::Pending))
        .all(&state.db)
        .await
        .expect("failed to query recovery requests")
        .into_iter()
        .map(|row| (row.id, row))
        .collect();

    // Same two batched lookups for the data-access side.
    let data_access_rows = data_access_request_contact::Entity::find()
        .filter(
            data_access_request_contact::Column::TrustedContactId
                .is_in(my_contact_rows.iter().map(|c| c.id)),
        )
        .filter(
            data_access_request_contact::Column::Status
                .eq(DataAccessRequestContactStatusEnum::Pending),
        )
        .all(&state.db)
        .await
        .expect("failed to query data access request contact rows");
    let data_access_by_id: HashMap<Uuid, data_access_request::Model> =
        data_access_request::Entity::find()
            .filter(
                data_access_request::Column::Id
                    .is_in(data_access_rows.iter().map(|r| r.data_access_request_id)),
            )
            .filter(data_access_request::Column::Status.eq(DataAccessRequestStatusEnum::Pending))
            .all(&state.db)
            .await
            .expect("failed to query data access requests")
            .into_iter()
            .map(|row| (row.id, row))
            .collect();

    // Still listed once access has opened - refusing works after the grant
    // opened, and that is when the owner most needs the button.
    for request in requests_on_my_data.expect("failed to query requests on the caller's data") {
        // Written down, not just filtered: an elapsed request left `pending`
        // would both keep presenting this sheet and block the contact from
        // ever asking again (see `close_if_expired`).
        let request = close_if_expired(&state.db, request).await;
        if request.status != DataAccessRequestStatusEnum::Pending {
            continue;
        }
        let rows = load_contact_rows(&state.db, request.id).await;
        actions.push(MePendingAction::DataAccessRequestOwner(
            data_access_response(&state, request, &rows).await,
        ));
    }

    for row in data_access_rows {
        let Some(request) = data_access_by_id.get(&row.data_access_request_id) else {
            continue;
        };
        if let Some(payload) = data_access_contact_response(&state, request, row).await {
            actions.push(MePendingAction::DataAccessRequestContact(payload));
        }
    }

    // `to_pending_contact_response` still runs once per match (its own
    // profile/device lookups aren't batched) - fine in practice, since a
    // user rarely has more than one or two of these at once.
    for contact_row in pending_contact_rows {
        let Some(request) = requests_by_id.get(&contact_row.recovery_request_id) else {
            continue;
        };
        actions.push(MePendingAction::RecoveryRequestContact(
            to_pending_contact_response(&state, request, contact_row).await,
        ));
    }

    Json(actions).into_response()
}
