//! Hand-written (not sea-orm-codegen output - see `trusted_contact.rs`'s own
//! header comment for why this discipline exists). Mirrors
//! `libs/db/src/lib/schemas/protestSession.ts`, whose doc comment carries the
//! reasoning for the two departures visible here: no `created_at` column (a
//! server-side timestamp would record when the account was at a protest), and
//! a client-minted `id` rather than a surrogate default, so a replayed write
//! from the device's offline outbox is idempotent rather than a duplicate.
//!
//! `sealed_key` is this session's own symmetric key sealed under the account's
//! recovery DEK, never the DEK itself - the TS doc explains the silent
//! data-loss bug that distinction exists to prevent.
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "protest_session")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(column_type = "Text")]
    pub owner_user_id: String,
    pub active: bool,
    #[sea_orm(column_type = "Text")]
    pub sealed_key: String,
    #[sea_orm(column_type = "Text")]
    pub metadata: String,
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
    User,
    #[sea_orm(has_many = "super::protest_blob::Entity")]
    ProtestBlob,
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl Related<super::protest_blob::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::ProtestBlob.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
