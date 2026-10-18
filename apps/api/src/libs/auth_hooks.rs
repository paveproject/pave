//! Keeps Pave's own `public.user` row in sync with better-auth-rs's
//! `auth.users` - created atomically alongside it (same transaction, when
//! one is active) instead of being lazily created on first `/me` touch.

use crate::libs::username_generator::generate_unique_username;
use async_trait::async_trait;
use auth::schema::user as auth_user;
use auth::AppAuthSchema;
use better_auth::prelude::CreateUser;
use better_auth::seaorm::{HookControl, SeaOrmHookContext, SeaOrmHooks};
use better_auth::AuthResult;
use db_rs::user as pave_user;
use sea_orm::{ActiveModelTrait, ActiveValue::Set};

/// Assigns a gamertag-style username (`SilentFalcon482`) to accounts that
/// sign up without one (every OTP signup - see `libs/auth/src/otp.rs`), so
/// `username`/`display_username` are never null. Runs before insert since
/// both columns are `NOT NULL`.
pub struct GenerateUsernameHook;

#[async_trait]
impl SeaOrmHooks<AppAuthSchema> for GenerateUsernameHook {
    async fn before_create_user(
        &self,
        user: &mut CreateUser,
        ctx: &SeaOrmHookContext<'_>,
    ) -> AuthResult<HookControl> {
        if user.username.is_none() {
            let (username, display_username) = match ctx.tx {
                Some(tx) => generate_unique_username(tx).await,
                None => generate_unique_username(ctx.db).await,
            };
            user.username = Some(username);
            user.display_username = Some(display_username);
        }
        Ok(HookControl::Continue)
    }
}

pub struct CreatePaveUserRowHook;

#[async_trait]
impl SeaOrmHooks<AppAuthSchema> for CreatePaveUserRowHook {
    async fn after_create_user(
        &self,
        user: &auth_user::Model,
        ctx: &SeaOrmHookContext<'_>,
    ) -> AuthResult<()> {
        let active = pave_user::ActiveModel {
            id: Set(user.id.clone()),
            // Matches `defaultSupportedLocale` in libs/i18n.
            language: Set("en-US".to_string()),
            welcomed_at: Set(None),
            username_updated_at: Set(None),
            // Matches the column defaults in `libs/db/src/lib/schemas/user.ts`.
            protest_mode_enabled: Set(false),
            recovery_delay_seconds: Set(86400),
            recovery_delay_protest_seconds: Set(3600),
        };

        match ctx.tx {
            Some(tx) => active.insert(tx).await,
            None => active.insert(ctx.db).await,
        }
        .expect("failed to create pave user row");

        Ok(())
    }
}
