//! Hand-written (not sea-orm-codegen output - see `trusted_contact.rs`'s
//! own header comment for why this discipline exists). Mirrors
//! `libs/db/src/lib/schemas/recoveryRequest.ts`'s `recoveryRequestContact`
//! table.
use super::sea_orm_active_enums::RecoveryRequestContactStatusEnum;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "recovery_request_contact")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(unique_key = "unique_recovery_request_trusted_contact")]
    pub recovery_request_id: Uuid,
    #[sea_orm(unique_key = "unique_recovery_request_trusted_contact")]
    pub trusted_contact_id: Uuid,
    pub status: RecoveryRequestContactStatusEnum,
    #[sea_orm(column_type = "Text", nullable)]
    pub encrypted_share: Option<String>,
    pub responded_at: Option<DateTimeWithTimeZone>,
    pub created_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::recovery_request::Entity",
        from = "Column::RecoveryRequestId",
        to = "super::recovery_request::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    RecoveryRequest,
    #[sea_orm(
        belongs_to = "super::trusted_contact::Entity",
        from = "Column::TrustedContactId",
        to = "super::trusted_contact::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    TrustedContact,
}

impl Related<super::recovery_request::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RecoveryRequest.def()
    }
}

impl Related<super::trusted_contact::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TrustedContact.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
