//! Hand-written, mirrors `libs/db/src/lib/schemas/protestSession.ts`'s
//! `protestBlob`. Metadata only: the encrypted bytes live in the private S3
//! bucket under `s3_key` and are never served through a URL, only proxied
//! back to the owner by the API.
//!
//! `seq` orders a session's blobs, since there is deliberately no cleartext
//! timestamp anywhere in this pair of tables.
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use super::sea_orm_active_enums::ProtestBlobKindEnum;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "protest_blob")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    pub session_id: Uuid,
    pub kind: ProtestBlobKindEnum,
    #[sea_orm(column_type = "Text")]
    pub s3_key: String,
    pub size: i32,
    pub seq: i32,
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
    ProtestSession,
}

impl Related<super::protest_session::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ProtestSession.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
