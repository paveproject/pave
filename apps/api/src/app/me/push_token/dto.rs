use db_rs::sea_orm_active_enums::{DeviceTypeEnum, PushProviderEnum};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "camelCase")]
pub struct MePushTokenSetRequest {
    pub provider: PushProvider,
    pub token: String,
    pub device_type: DeviceType,
}

#[derive(Debug, Clone, Deserialize, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum PushProvider {
    Fcm,
    Apns,
}

impl From<PushProvider> for PushProviderEnum {
    fn from(value: PushProvider) -> Self {
        match value {
            PushProvider::Fcm => PushProviderEnum::Fcm,
            PushProvider::Apns => PushProviderEnum::Apns,
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
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

impl From<DeviceTypeEnum> for DeviceType {
    fn from(value: DeviceTypeEnum) -> Self {
        match value {
            DeviceTypeEnum::Web => DeviceType::Web,
            DeviceTypeEnum::Ios => DeviceType::Ios,
            DeviceTypeEnum::Android => DeviceType::Android,
        }
    }
}
