//! Hand-written (not sea-orm-codegen output - see `trusted_contact.rs`'s
//! own header comment for why this discipline exists; this one doesn't
//! actually need it - two FKs to two *different* entities works fine
//! with `DeriveRelation` - but is kept hand-written alongside its
//! siblings for consistency). Mirrors
//! `libs/db/src/lib/schemas/device.ts`'s `trustedContactShare` table.
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "trusted_contact_share")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(unique_key = "unique_trusted_contact_device")]
    pub trusted_contact_id: Uuid,
    #[sea_orm(unique_key = "unique_trusted_contact_device")]
    pub device_id: Uuid,
    #[sea_orm(column_type = "Text")]
    pub encrypted_share: String,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::trusted_contact::Entity",
        from = "Column::TrustedContactId",
        to = "super::trusted_contact::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    TrustedContact,
    #[sea_orm(
        belongs_to = "super::device::Entity",
        from = "Column::DeviceId",
        to = "super::device::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    Device,
}

impl Related<super::trusted_contact::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TrustedContact.def()
    }
}

impl Related<super::device::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Device.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
