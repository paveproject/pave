//! Hand-written (not sea-orm-codegen output - see `trusted_contact.rs`'s
//! own header comment for why this discipline exists). Mirrors
//! `libs/db/src/lib/schemas/recoveryRequest.ts`'s `recoveryRequest` table.
use super::sea_orm_active_enums::RecoveryRequestStatusEnum;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "recovery_request")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(column_type = "Text")]
    pub owner_user_id: String,
    pub requesting_device_id: Uuid,
    pub status: RecoveryRequestStatusEnum,
    pub release_at: DateTimeWithTimeZone,
    pub completed_at: Option<DateTimeWithTimeZone>,
    pub cancelled_at: Option<DateTimeWithTimeZone>,
    pub failed_at: Option<DateTimeWithTimeZone>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::user::Entity",
        from = "Column::OwnerUserId",
        to = "super::user::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    Owner,
    #[sea_orm(
        belongs_to = "super::device::Entity",
        from = "Column::RequestingDeviceId",
        to = "super::device::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    RequestingDevice,
    #[sea_orm(has_many = "super::recovery_request_contact::Entity")]
    RecoveryRequestContact,
}

impl Related<super::device::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RequestingDevice.def()
    }
}

impl Related<super::recovery_request_contact::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RecoveryRequestContact.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
