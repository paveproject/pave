//! Hand-written (not sea-orm-codegen output - see `trusted_contact.rs`'s
//! own header comment for why this discipline exists). Mirrors
//! `libs/db/src/lib/schemas/dataAccessRequest.ts`'s
//! `dataAccessRequestContact` table.
use super::sea_orm_active_enums::DataAccessRequestContactStatusEnum;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "data_access_request_contact")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(unique_key = "unique_data_access_request_contact")]
    pub data_access_request_id: Uuid,
    #[sea_orm(unique_key = "unique_data_access_request_contact")]
    pub trusted_contact_id: Uuid,
    pub status: DataAccessRequestContactStatusEnum,
    /// The contact's own share, re-sealed to the requesting device. The server
    /// relays an envelope it cannot open.
    #[sea_orm(column_type = "Text", nullable)]
    pub encrypted_share: Option<String>,
    pub responded_at: Option<DateTimeWithTimeZone>,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::data_access_request::Entity",
        from = "Column::DataAccessRequestId",
        to = "super::data_access_request::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    DataAccessRequest,
    #[sea_orm(
        belongs_to = "super::trusted_contact::Entity",
        from = "Column::TrustedContactId",
        to = "super::trusted_contact::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    TrustedContact,
}

impl Related<super::data_access_request::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::DataAccessRequest.def()
    }
}

impl Related<super::trusted_contact::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TrustedContact.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
