use better_auth::seaorm::sea_orm::entity::prelude::*;
use better_auth::seaorm::AuthEntity;
use better_auth::AuthSchema;
pub mod user {
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
