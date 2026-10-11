use crate::libs::entities::sea_orm_active_enums::AppPlatformEnum;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// Mirrors the Postgres `system.platform` enum (see
/// `libs/db/src/lib/schemas/system.ts`) - a separate wire-facing enum
/// rather than exposing `AppPlatformEnum` directly, same convention as
/// `reports::dto::ReportType`/`ReportTypeEnum`.
///
/// `web` isn't sent by anything yet (the mobile app is the only caller),
/// but is kept so a future web version gate is a client change only, not a
/// data model one.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum AppPlatform {
    Ios,
    Android,
    Web,
}

impl AppPlatform {
    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "ios" => Some(Self::Ios),
            "android" => Some(Self::Android),
            "web" => Some(Self::Web),
            _ => None,
        }
    }
}

impl From<AppPlatform> for AppPlatformEnum {
    fn from(value: AppPlatform) -> Self {
        match value {
            AppPlatform::Ios => AppPlatformEnum::Ios,
            AppPlatform::Android => AppPlatformEnum::Android,
            AppPlatform::Web => AppPlatformEnum::Web,
        }
    }
}

impl From<AppPlatformEnum> for AppPlatform {
    fn from(value: AppPlatformEnum) -> Self {
        match value {
            AppPlatformEnum::Ios => AppPlatform::Ios,
            AppPlatformEnum::Android => AppPlatform::Android,
            AppPlatformEnum::Web => AppPlatform::Web,
        }
    }
}

/// `up_to_date`: nothing to do. `update_available`: an update exists but the
/// app still works fine without it. `update_required`: the calling app's
/// own version is below the configured minimum for its platform - this is
/// the only status the mobile app actually surfaces to the user today (a
/// dismissible native alert, re-shown every cold start - see
/// `useAppVersionCheck`), since the app is offline-first and nothing on the
/// API side ever blocks a request over this. Always `up_to_date` (with null
/// versions) when the caller didn't send its app headers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum VersionStatus {
    UpToDate,
    UpdateAvailable,
    UpdateRequired,
}

#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct AppVersionStatus {
    pub status: VersionStatus,
    #[schema(example = "1.6.0")]
    pub min_version: Option<String>,
    #[schema(example = "1.7.0")]
    pub latest_version: Option<String>,
}

/// `GET /status`: maintenance mode + (when the caller sent `x-app-platform`/
/// `x-app-version`) that app's own version status, in one round trip.
#[derive(Debug, Clone, Serialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct StatusResponse {
    #[schema(example = false)]
    pub is_maintenance: bool,
    pub version: AppVersionStatus,
}
