//! Hand-added (not sea-orm-codegen output, unlike most of this module) -
//! mirrors Postgres `system.version_policy` (see
//! `libs/db/src/lib/schemas/system.ts`). One row per (platform, version)
//! ever reported, not one row per platform - see
//! `apps/api/src/app/system/service.rs` for how `live` rows get turned into
//! the actual min/latest version per platform.

use super::sea_orm_active_enums::{AppPlatformEnum, VersionReleaseStateEnum};
use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(schema_name = "system", table_name = "version_policy")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub platform: AppPlatformEnum,
    #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
    pub version: String,
    pub is_breaking: bool,
    pub state: VersionReleaseStateEnum,
    pub created_at: DateTimeWithTimeZone,
    pub updated_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
