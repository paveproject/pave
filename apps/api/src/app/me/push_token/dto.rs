use crate::entities::sea_orm_active_enums::{DeviceTypeEnum, PushProviderEnum};
use serde::Deserialize;
use utoipa::ToSchema;

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct SetPushTokenRequest {
    pub provider: PushProvider,
    pub token: String,
    pub device_type: DeviceType,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum PushProvider {
    Expo,
}

impl From<PushProvider> for PushProviderEnum {
    fn from(value: PushProvider) -> Self {
        match value {
            PushProvider::Expo => PushProviderEnum::Expo,
        }
    }
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum DeviceType {
    Web,
    Ios,
    Android,
}

impl From<DeviceType> for DeviceTypeEnum {
    fn from(value: DeviceType) -> Self {
        match value {
            DeviceType::Web => DeviceTypeEnum::Web,
            DeviceType::Ios => DeviceTypeEnum::Ios,
            DeviceType::Android => DeviceTypeEnum::Android,
        }
    }
}
