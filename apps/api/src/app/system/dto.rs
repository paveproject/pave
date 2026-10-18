use db_rs::sea_orm_active_enums::AppPlatformEnum;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

/// `web` isn't sent by anything yet (mobile is the only caller), but is
/// kept so a future web version gate is a client change only.
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

/// `update_required`: below the configured minimum version - the only
/// status the mobile app surfaces to the user (a dismissible alert,
/// since nothing on the API side ever blocks a request over this).
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
