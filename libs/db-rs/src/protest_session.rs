//! Hand-written (not sea-orm-codegen output). Mirrors
//! `libs/db/src/lib/schemas/protestSession.ts`. `id` is client-supplied
//! (no DB-generated default) - see that file's own doc comment.
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "protest_session")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(column_type = "Text")]
    pub owner_user_id: String,
    pub started_at: DateTimeWithTimeZone,
    pub ended_at: Option<DateTimeWithTimeZone>,
    pub created_at: DateTimeWithTimeZone,
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
    #[sea_orm(has_many = "super::protest_upload::Entity")]
    Uploads,
}

impl Related<super::protest_upload::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Uploads.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
