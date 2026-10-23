//! Hand-written (not sea-orm-codegen output - see `trusted_contact.rs`'s
//! own header comment for why this discipline exists). Mirrors
//! `libs/db/src/lib/schemas/recoveryKeyMnemonic.ts`. `user_id` is the
//! literal primary key, not a surrogate uuid - a genuine 1:1 extension of
//! the user row, nothing else ever FKs to it (unlike `device`/
//! `trusted_contact`, which need one).
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "recovery_key_mnemonic")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
    pub user_id: String,
    #[sea_orm(column_type = "Text")]
    pub encrypted_dek: String,
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
}

impl Related<super::user::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::User.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
