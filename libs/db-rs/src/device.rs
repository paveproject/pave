//! Hand-written (not sea-orm-codegen output - see `trusted_contact.rs`'s
//! own header comment for why this discipline exists). Mirrors
//! `libs/db/src/lib/schemas/device.ts`.
use super::sea_orm_active_enums::{DeviceStatusEnum, DeviceTypeEnum};
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "device")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(column_type = "Text", unique_key = "unique_user_public_key")]
    pub user_id: String,
    #[sea_orm(column_type = "Text")]
    pub session_id: String,
    #[sea_orm(column_type = "Text", unique_key = "unique_user_public_key")]
    pub public_key: String,
    pub device_type: DeviceTypeEnum,
    pub status: DeviceStatusEnum,
    #[sea_orm(column_type = "Text", nullable)]
    pub encrypted_dek: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub location_city: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub location_country: Option<String>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::UserId",
        to = "super::user::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    User,
    #[sea_orm(has_many = "super::trusted_contact_share::Entity")]
    TrustedContactShare,
    #[sea_orm(has_many = "super::recovery_request::Entity")]
    RecoveryRequest,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl Related<super::trusted_contact_share::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TrustedContactShare.def()
    }
}

impl Related<super::recovery_request::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RecoveryRequest.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
