//! Hand-written (not sea-orm-codegen output). Mirrors
//! `libs/db/src/lib/schemas/protestSession.ts`.
use super::sea_orm_active_enums::ProtestUploadKindEnum;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "protest_upload")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub session_id: Uuid,
    pub kind: ProtestUploadKindEnum,
    #[sea_orm(column_type = "Text")]
    pub s3_key: String,
    pub size: i32,
    pub created_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::protest_session::Entity",
        from = "Column::SessionId",
        to = "super::protest_session::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    Session,
}

impl Related<super::protest_session::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Session.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
