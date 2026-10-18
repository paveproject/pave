//! Turns a `PushTarget` (who) into actual push tokens, providers, and
//! languages (how to actually reach them) - the whole reason `notify` has
//! its own database access (see `PushTarget`'s own doc comment in
//! `notify-contracts`): `api` only ever hands over ids it already has,
//! never a token or a language.
use db_rs::sea_orm_active_enums::{DeviceStatusEnum, PushProviderEnum};
use db_rs::{device, push_token, user};
use notify_contracts::{Lang, PushProvider, PushTarget};
use sea_orm::{ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter};
use uuid::Uuid;

pub struct PushRecipient {
    pub token: String,
    pub provider: PushProvider,
    pub lang: Lang,
}

pub async fn resolve_push_recipients(
    db: &DatabaseConnection,
    target: &PushTarget,
) -> Vec<PushRecipient> {
    match target {
        PushTarget::Users { user_ids } => tokens_for_users(db, user_ids.clone()).await,
        PushTarget::Device { user_id, device_id } => {
            let Ok(device_id) = Uuid::parse_str(device_id) else {
                tracing::warn!(%device_id, "push target has an invalid device id, skipping");
                return Vec::new();
            };
            let Some(device) = device::Entity::find_by_id(device_id)
                .filter(device::Column::UserId.eq(user_id.clone()))
                .one(db)
                .await
                .expect("failed to query target device")
            else {
                return Vec::new();
            };
            tokens_for_sessions(db, user_id.clone(), vec![device.session_id]).await
        }
        PushTarget::OtherActiveDevices {
            user_id,
            excluding_device_id,
        } => {
            let mut query = device::Entity::find()
                .filter(device::Column::UserId.eq(user_id.clone()))
                .filter(device::Column::Status.eq(DeviceStatusEnum::Active));
            if let Ok(excluding_device_id) = Uuid::parse_str(excluding_device_id) {
                query = query.filter(device::Column::Id.ne(excluding_device_id));
            }
            let session_ids: Vec<String> = query
                .all(db)
                .await
                .expect("failed to query active sibling devices")
                .into_iter()
                .map(|d| d.session_id)
                .collect();
            tokens_for_sessions(db, user_id.clone(), session_ids).await
        }
    }
}

async fn tokens_for_users(db: &DatabaseConnection, user_ids: Vec<String>) -> Vec<PushRecipient> {
    if user_ids.is_empty() {
        return Vec::new();
    }
    push_token::Entity::find()
        .find_also_related(user::Entity)
        .filter(push_token::Column::UserId.is_in(user_ids))
        .all(db)
        .await
        .expect("failed to query push tokens for users")
        .into_iter()
        .map(to_recipient)
        .collect()
}

async fn tokens_for_sessions(
    db: &DatabaseConnection,
    user_id: String,
    session_ids: Vec<String>,
) -> Vec<PushRecipient> {
    if session_ids.is_empty() {
        return Vec::new();
    }
    push_token::Entity::find()
        .find_also_related(user::Entity)
        .filter(push_token::Column::UserId.eq(user_id))
        .filter(push_token::Column::SessionId.is_in(session_ids))
        .all(db)
        .await
        .expect("failed to query push tokens for sessions")
        .into_iter()
        .map(to_recipient)
        .collect()
}

fn to_recipient((token, user): (push_token::Model, Option<user::Model>)) -> PushRecipient {
    let language = user.map(|u| u.language).unwrap_or_default();
    PushRecipient {
        token: token.token,
        provider: match token.provider {
            PushProviderEnum::Fcm => PushProvider::Fcm,
            PushProviderEnum::Apns => PushProvider::Apns,
        },
        lang: match language.as_str() {
            "fr-FR" => Lang::Fr,
            _ => Lang::En,
        },
    }
}
