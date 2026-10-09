use better_auth::AuthSchema;
use better_auth::seaorm::sea_orm;
use better_auth::seaorm::sea_orm::entity::prelude::*;
use better_auth::seaorm::sea_orm::{ConnectionTrait, Schema};
use better_auth::seaorm::sea_orm::sea_query::{
    Alias, ForeignKey, ForeignKeyAction, Index,
};
use better_auth::seaorm::AuthEntity;
mod user {
    use super::*;
    #[derive(Clone, Debug, serde::Serialize, DeriveEntityModel, AuthEntity)]
    #[auth(role = "user")]
    #[sea_orm(table_name = "users")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub name: Option<String>,
        pub email: Option<String>,
        pub email_verified: bool,
        pub image: Option<String>,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        pub username: Option<String>,
        pub display_username: Option<String>,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}
mod session {
    use super::*;
    #[derive(Clone, Debug, serde::Serialize, DeriveEntityModel, AuthEntity)]
    #[auth(role = "session")]
    #[sea_orm(table_name = "sessions")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub expires_at: DateTimeUtc,
        pub token: String,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
        pub ip_address: Option<String>,
        pub user_agent: Option<String>,
        pub user_id: String,
        pub active: bool,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}
mod account {
    use super::*;
    #[derive(Clone, Debug, serde::Serialize, DeriveEntityModel, AuthEntity)]
    #[auth(role = "account")]
    #[sea_orm(table_name = "accounts")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub account_id: String,
        pub provider_id: String,
        pub user_id: String,
        pub access_token: Option<String>,
        pub refresh_token: Option<String>,
        pub id_token: Option<String>,
        pub access_token_expires_at: Option<DateTimeUtc>,
        pub refresh_token_expires_at: Option<DateTimeUtc>,
        pub scope: Option<String>,
        pub password: Option<String>,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}
mod verification {
    use super::*;
    #[derive(Clone, Debug, serde::Serialize, DeriveEntityModel, AuthEntity)]
    #[auth(role = "verification")]
    #[sea_orm(table_name = "verifications")]
    pub struct Model {
        #[sea_orm(primary_key, auto_increment = false)]
        pub id: String,
        pub identifier: String,
        pub value: String,
        pub expires_at: DateTimeUtc,
        pub created_at: DateTimeUtc,
        pub updated_at: DateTimeUtc,
    }
    #[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
    pub enum Relation {}
    impl ActiveModelBehavior for ActiveModel {}
}
pub struct AppAuthSchema;
impl AuthSchema for AppAuthSchema {
    type User = user::Model;
    type Session = session::Model;
    type Account = account::Model;
    type Verification = verification::Model;
}
/// Create auth tables in an empty database.
///
/// Call this scaffold from the application's initial migration.
/// Use versioned migrations to change existing tables.
pub async fn create_auth_tables(
    database: &impl ConnectionTrait,
) -> Result<(), sea_orm::DbErr> {
    let schema = Schema::new(database.get_database_backend());
    for statement in [
        schema.create_table_from_entity(user::Entity).if_not_exists().to_owned(),
        schema
            .create_table_from_entity(session::Entity)
            .if_not_exists()
            .foreign_key(
                ForeignKey::create()
                    .name("fk_sessions_user_id")
                    .from(Alias::new("sessions"), Alias::new("user_id"))
                    .to(Alias::new("users"), Alias::new("id"))
                    .on_delete(ForeignKeyAction::Cascade),
            )
            .to_owned(),
        schema
            .create_table_from_entity(account::Entity)
            .if_not_exists()
            .foreign_key(
                ForeignKey::create()
                    .name("fk_accounts_user_id")
                    .from(Alias::new("accounts"), Alias::new("user_id"))
                    .to(Alias::new("users"), Alias::new("id"))
                    .on_delete(ForeignKeyAction::Cascade),
            )
            .to_owned(),
        schema.create_table_from_entity(verification::Entity).if_not_exists().to_owned(),
    ] {
        let _ = database.execute(&statement).await?;
    }
    for statement in [
        Index::create()
            .if_not_exists()
            .name("idx_users_email")
            .table(Alias::new("users"))
            .col(Alias::new("email"))
            .unique()
            .to_owned(),
        Index::create()
            .if_not_exists()
            .name("idx_users_username")
            .table(Alias::new("users"))
            .col(Alias::new("username"))
            .unique()
            .to_owned(),
        Index::create()
            .if_not_exists()
            .name("idx_sessions_token")
            .table(Alias::new("sessions"))
            .col(Alias::new("token"))
            .unique()
            .to_owned(),
        Index::create()
            .if_not_exists()
            .name("idx_sessions_user_id")
            .table(Alias::new("sessions"))
            .col(Alias::new("user_id"))
            .to_owned(),
        Index::create()
            .if_not_exists()
            .name("idx_sessions_expires_at")
            .table(Alias::new("sessions"))
            .col(Alias::new("expires_at"))
            .to_owned(),
        Index::create()
            .if_not_exists()
            .name("idx_accounts_provider_id_account_id")
            .table(Alias::new("accounts"))
            .col(Alias::new("provider_id"))
            .col(Alias::new("account_id"))
            .unique()
            .to_owned(),
        Index::create()
            .if_not_exists()
            .name("idx_accounts_user_id")
            .table(Alias::new("accounts"))
            .col(Alias::new("user_id"))
            .to_owned(),
        Index::create()
            .if_not_exists()
            .name("idx_verifications_identifier")
            .table(Alias::new("verifications"))
            .col(Alias::new("identifier"))
            .to_owned(),
    ] {
        let _ = database.execute(&statement).await?;
    }
    Ok(())
}
