use crate::app::system::dto::AppPlatform;
use crate::app::system::service as system_service;
use crate::libs::app_store_connect::AppStoreConnectClient;
use sea_orm::DatabaseConnection;
use serde_json::Value;

// The only state that means "the store confirms this version is actually
// downloadable" - every other value (IN_REVIEW, WAITING_FOR_REVIEW,
// PENDING_DEVELOPER_RELEASE, ...) is a transient step in the review process
// this doesn't act on.
const LIVE_APP_VERSION_STATE: &str = "READY_FOR_DISTRIBUTION";
const EVENT_TYPE_APP_VERSION_STATE_UPDATED: &str = "appStoreVersionAppVersionStateUpdated";

/// `event` is the webhook payload's `data` field. Always succeeds from the
/// caller's point of view (nothing here is surfaced back to Apple as an
/// error) - an event this doesn't recognize or act on is just logged and
/// ignored, same as Recomend's `WebhookAppStoreConnectService.handleEvent`.
pub async fn handle_event(db: &DatabaseConnection, apple: &AppStoreConnectClient, event: &Value) {
    let event_type = event.get("type").and_then(Value::as_str);
    if event_type != Some(EVENT_TYPE_APP_VERSION_STATE_UPDATED) {
        tracing::info!(
            ?event_type,
            "ignoring unrecognized app-store-connect webhook event"
        );
        return;
    }

    let new_value = event
        .pointer("/attributes/newValue")
        .and_then(Value::as_str);
    let version_id = event
        .pointer("/relationships/instance/data/id")
        .and_then(Value::as_str);

    let (Some(new_value), Some(version_id)) = (new_value, version_id) else {
        return;
    };

    if new_value != LIVE_APP_VERSION_STATE {
        tracing::info!(%new_value, "ignoring app version state change");
        return;
    }

    let Some(version) = apple.get_app_store_version(version_id).await else {
        tracing::warn!(%version_id, "appStoreVersions not found, ignoring");
        return;
    };

    if let (Some(app_id), Some(expected)) = (version.app_id.as_deref(), apple.app_id()) {
        if app_id != expected {
            tracing::warn!(
                %version_id,
                app_id,
                "appStoreVersions belongs to a different app, ignoring"
            );
            return;
        }
    }

    if version.platform != "IOS" {
        tracing::info!(platform = %version.platform, "ignoring non-iOS platform");
        return;
    }

    tracing::info!(version = %version.version_string, "ios app version is now live");

    if let Err(err) =
        system_service::confirm_version_live(db, AppPlatform::Ios, version.version_string).await
    {
        tracing::error!(%err, "failed to confirm live app version");
    }
}
