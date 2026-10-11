use super::dto::{AppPlatform, AppVersionStatus, StatusResponse, VersionStatus};
use super::headers::AppHeaders;
use super::version_rules::{evaluate_status, max_version, VersionPolicy};
use crate::libs::entities::sea_orm_active_enums::AppPlatformEnum;
use crate::libs::entities::sea_orm_active_enums::VersionReleaseStateEnum;
use crate::libs::entities::version_policy;
use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, DatabaseBackend, DatabaseConnection, DbErr,
    EntityTrait, FromQueryResult, IntoActiveModel, QueryFilter, Statement,
};

#[derive(Debug, FromQueryResult)]
struct ConfigValueRow {
    value: serde_json::Value,
}

/// Reads one `system.config` key. No caching: unlike Recomend, nothing here
/// runs on every API request (there is no `AppVersionMiddleware`) - `/status`
/// is only called once per mobile app launch, far too low-volume to need a
/// cache in front of Postgres.
async fn is_maintenance(db: &DatabaseConnection) -> bool {
    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"SELECT value FROM "system"."config" WHERE key = $1"#,
        ["is_maintenance".into()],
    );

    match ConfigValueRow::find_by_statement(stmt).one(db).await {
        Ok(Some(row)) => row.value.as_bool().unwrap_or(false),
        Ok(None) => false,
        Err(err) => {
            // A DB hiccup here must never take maintenance-mode reporting
            // down with it (fail open, same reasoning as reports' rate
            // limiter failing open on a Redis error).
            tracing::error!(%err, "failed to read system.config, assuming not in maintenance");
            false
        }
    }
}

async fn live_versions_for_platform(
    db: &DatabaseConnection,
    platform: AppPlatform,
) -> Vec<version_policy::Model> {
    version_policy::Entity::find()
        .filter(version_policy::Column::Platform.eq(AppPlatformEnum::from(platform)))
        .filter(version_policy::Column::State.eq(VersionReleaseStateEnum::Live))
        .all(db)
        .await
        .unwrap_or_else(|err| {
            tracing::error!(%err, "failed to load version_policy, assuming no policy configured");
            Vec::new()
        })
}

/// `app` is `None` for callers that never sent their app headers - they get
/// a neutral `up_to_date` back.
pub async fn get_status(db: &DatabaseConnection, app: Option<AppHeaders>) -> StatusResponse {
    let is_maintenance = is_maintenance(db).await;

    let version = match app {
        None => AppVersionStatus {
            status: VersionStatus::UpToDate,
            min_version: None,
            latest_version: None,
        },
        Some(app) => {
            let rows = live_versions_for_platform(db, app.platform).await;
            let min_version = max_version(
                rows.iter()
                    .filter(|row| row.is_breaking)
                    .map(|row| row.version.as_str()),
            );
            let latest_version = max_version(rows.iter().map(|row| row.version.as_str()));

            let status = evaluate_status(
                &app.version,
                &VersionPolicy {
                    min_version: min_version.clone(),
                    latest_version: latest_version.clone(),
                },
            );

            AppVersionStatus {
                status,
                min_version,
                latest_version,
            }
        }
    };

    StatusResponse {
        is_maintenance,
        version,
    }
}

#[derive(Debug)]
pub enum UpdateVersionPolicyError {
    InvalidVersion,
    Db(DbErr),
}

/// Records a new release as `pending` for `platform`. This does NOT move
/// `minVersion`/`latestVersion` yet - a store submission can sit in review
/// for hours or days, and enforcing (or even nudging towards) a version
/// nobody can download yet would be worse than not enforcing anything.
/// [`confirm_version_live`] is what actually takes effect, once the store
/// confirms the version is available (see
/// `apps/api/src/app/webhooks/app_store_connect`). `is_breaking` can only be
/// known by the caller (release-please's version bump, at release time) -
/// never from the store itself - so it's set once, on insert, and never
/// touched again (`ON CONFLICT DO NOTHING`).
pub async fn update_version_policy(
    db: &DatabaseConnection,
    platform: AppPlatform,
    version: String,
    is_breaking: bool,
) -> Result<(), UpdateVersionPolicyError> {
    if !super::version_rules::is_valid_version(&version) {
        return Err(UpdateVersionPolicyError::InvalidVersion);
    }

    let now = chrono::Utc::now().into();
    version_policy::Entity::insert(version_policy::ActiveModel {
        platform: Set(platform.into()),
        version: Set(version),
        is_breaking: Set(is_breaking),
        state: Set(VersionReleaseStateEnum::Pending),
        created_at: Set(now),
        updated_at: Set(now),
    })
    .on_conflict(
        OnConflict::columns([
            version_policy::Column::Platform,
            version_policy::Column::Version,
        ])
        .do_nothing()
        .to_owned(),
    )
    .exec(db)
    .await
    .map_err(UpdateVersionPolicyError::Db)?;

    Ok(())
}

/// Called once a store confirms `version` is actually available (see
/// `apps/api/src/app/webhooks/app_store_connect`). A plain update, not an
/// upsert - [`update_version_policy`] is what creates the row (with the
/// right `is_breaking`); if it hasn't run yet, this is a no-op rather than
/// guessing.
pub async fn confirm_version_live(
    db: &DatabaseConnection,
    platform: AppPlatform,
    version: String,
) -> Result<(), DbErr> {
    let platform_enum: AppPlatformEnum = platform.into();
    let existing = version_policy::Entity::find_by_id((platform_enum, version))
        .one(db)
        .await?;

    if let Some(model) = existing {
        let mut active = model.into_active_model();
        active.state = Set(VersionReleaseStateEnum::Live);
        active.updated_at = Set(chrono::Utc::now().into());
        active.update(db).await?;
    }

    Ok(())
}
