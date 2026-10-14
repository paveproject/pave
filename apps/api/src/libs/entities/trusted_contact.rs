//! Hand-written (not sea-orm-codegen output - this table has two FKs to
//! `user`, which the `Related<>` trait can't express twice for the same
//! target type, same reasoning `push_token.rs`'s neighbors give for their
//! own hand-added enums). Mirrors
//! `libs/db/src/lib/schemas/trustedContact.ts`.
use super::sea_orm_active_enums::TrustedContactStatusEnum;
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "trusted_contact")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: Uuid,
    #[sea_orm(column_type = "Text", unique_key = "unique_owner_contact")]
    pub owner_user_id: String,
    #[sea_orm(column_type = "Text", nullable, unique_key = "unique_owner_contact")]
    pub contact_user_id: Option<String>,
    pub status: TrustedContactStatusEnum,
    #[sea_orm(column_type = "Text")]
    pub invite_code_hash: String,
    pub invite_code_expires_at: DateTimeWithTimeZone,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
    #[sea_orm(column_type = "Text", nullable)]
    pub encrypted_share: Option<String>,
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
        belongs_to = "super::user::Entity",
        from = "Column::ContactUserId",
        to = "super::user::Column::Id",
        on_update = "NoAction",
        on_delete = "Cascade"
    )]
    Contact,
}

impl ActiveModelBehavior for ActiveModel {}
