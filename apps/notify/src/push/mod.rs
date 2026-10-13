//! Push notification sending - one provider client per transport, built
//! once at boot (see `main.rs`) and reused for the process lifetime. Each
//! side is independently optional: shipping before both are configured is
//! fine, same reasoning as `apps/api`'s `AppStoreConnectClient`.
mod apns;
mod fcm;

use notify_contracts::{PushNotificationPayload, PushProvider};

pub struct PushSender {
    fcm: Option<fcm::FcmClient>,
    apns: Option<a2::Client>,
    apns_bundle_id: Option<String>,
}

impl PushSender {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        fcm_project_id: Option<&str>,
        fcm_client_email: Option<&str>,
        fcm_private_key_b64: Option<&str>,
        apns_key_b64: Option<&str>,
        apns_key_id: Option<&str>,
        apns_team_id: Option<&str>,
        apns_bundle_id: Option<String>,
        apns_production: bool,
    ) -> Self {
        let fcm = match (fcm_project_id, fcm_client_email, fcm_private_key_b64) {
            (Some(project_id), Some(client_email), Some(private_key_b64)) => {
                fcm::FcmClient::new(project_id, client_email, private_key_b64)
            }
            _ => None,
        };

        let apns = match (apns_key_b64, apns_key_id, apns_team_id) {
            (Some(key), Some(key_id), Some(team_id)) => {
                apns::build_client(key, key_id, team_id, apns_production)
            }
            _ => None,
        };

        Self {
            fcm,
            apns,
            apns_bundle_id,
        }
    }

    pub async fn send(&self, payload: &PushNotificationPayload) {
        let result = match payload.provider {
            PushProvider::Fcm => match &self.fcm {
                Some(client) => {
                    client
                        .send(&payload.token, &payload.title, &payload.body, &payload.data)
                        .await
                }
                None => Err("FCM not configured".to_string()),
            },
            PushProvider::Apns => match (&self.apns, &self.apns_bundle_id) {
                (Some(client), Some(topic)) => {
                    apns::send(
                        client,
                        topic,
                        &payload.token,
                        &payload.title,
                        &payload.body,
                        &payload.data,
                    )
                    .await
                }
                _ => Err("APNs not configured".to_string()),
            },
        };

        if let Err(err) = result {
            tracing::error!(%err, provider = ?payload.provider, "failed to send push notification");
        }
    }
}
