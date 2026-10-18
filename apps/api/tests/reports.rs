use api_testkit::{fresh_app, shared_test_env};
use axum::http::StatusCode;
use chrono::{Duration, Utc};
use serde_json::json;
use uuid::Uuid;

// Paris-ish, arbitrary - just needs to be inside the bbox used below.
const LAT: f64 = 48.8566;
const LNG: f64 = 2.3522;

fn list_url(min_lat: f64, min_lng: f64, max_lat: f64, max_lng: f64) -> String {
    format!("/reports?minLat={min_lat}&minLng={min_lng}&maxLat={max_lat}&maxLng={max_lng}")
}

// ---------------------------------------------------------------------------
// create_report (POST /reports)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn creating_a_report_makes_it_listable() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let id = Uuid::new_v4().to_string();
    let (status, created) = app
        .request(
            "POST",
            "/reports",
            Some(&token),
            Some(json!({
                "id": id,
                "type": "tear_gas",
                "lat": LAT,
                "lng": LNG,
                "occurredAt": Utc::now().to_rfc3339(),
            })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{created}");
    assert_eq!(created["id"], id);

    let (status, list) = app
        .request(
            "GET",
            &list_url(LAT - 0.1, LNG - 0.1, LAT + 0.1, LNG + 0.1),
            None,
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{list}");
    let reports = list.as_array().expect("should be an array");
    assert!(reports.iter().any(|r| r["id"] == id));
}

/// `id` is always client-generated - a repeat (WatermelonDB re-pushing an
/// unsynced row after a reconnect) must be a no-op, not a duplicate or an
/// overwrite.
#[tokio::test]
#[serial_test::serial]
async fn creating_the_same_report_id_twice_is_a_noop() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let id = Uuid::new_v4().to_string();
    let occurred_at = Utc::now().to_rfc3339();

    app.request(
        "POST",
        "/reports",
        Some(&token),
        Some(json!({
            "id": id, "type": "tear_gas", "lat": LAT, "lng": LNG, "occurredAt": occurred_at,
        })),
    )
    .await;
    app.request(
        "POST",
        "/reports",
        Some(&token),
        Some(json!({
            "id": id, "type": "arrest", "lat": LAT, "lng": LNG, "occurredAt": occurred_at,
        })),
    )
    .await;

    let (_, list) = app
        .request(
            "GET",
            &list_url(LAT - 0.1, LNG - 0.1, LAT + 0.1, LNG + 0.1),
            None,
            None,
        )
        .await;
    let matches: Vec<_> = list
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["id"] == id)
        .collect();
    assert_eq!(matches.len(), 1, "a repeat id must not create a second row");
    assert_eq!(matches[0]["type"], "tear_gas", "the first insert wins");
}

#[tokio::test]
#[serial_test::serial]
async fn create_report_requires_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request(
            "POST",
            "/reports",
            None,
            Some(json!({
                "id": Uuid::new_v4().to_string(),
                "type": "tear_gas",
                "lat": LAT,
                "lng": LNG,
                "occurredAt": Utc::now().to_rfc3339(),
            })),
        )
        .await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

/// At most 5 reports per minute per user (see `rate_limit.rs`) - the 6th
/// in the same window must be rejected.
#[tokio::test]
#[serial_test::serial]
async fn creating_too_many_reports_is_rate_limited() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    for _ in 0..5 {
        let (status, body) = app
            .request(
                "POST",
                "/reports",
                Some(&token),
                Some(json!({
                    "id": Uuid::new_v4().to_string(),
                    "type": "tear_gas",
                    "lat": LAT,
                    "lng": LNG,
                    "occurredAt": Utc::now().to_rfc3339(),
                })),
            )
            .await;
        assert_eq!(status, StatusCode::OK, "{body}");
    }

    let (status, _) = app
        .request(
            "POST",
            "/reports",
            Some(&token),
            Some(json!({
                "id": Uuid::new_v4().to_string(),
                "type": "tear_gas",
                "lat": LAT,
                "lng": LNG,
                "occurredAt": Utc::now().to_rfc3339(),
            })),
        )
        .await;
    assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
}

// ---------------------------------------------------------------------------
// list_reports (GET /reports)
// ---------------------------------------------------------------------------

#[tokio::test]
#[serial_test::serial]
async fn list_reports_does_not_require_authentication() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let (status, _) = app
        .request("GET", &list_url(-1.0, -1.0, 1.0, 1.0), None, None)
        .await;
    assert_eq!(status, StatusCode::OK);
}

#[tokio::test]
#[serial_test::serial]
async fn list_reports_excludes_ones_outside_the_bbox() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let id = Uuid::new_v4().to_string();
    // Far from `LAT`/`LNG` (Paris) - Tokyo.
    app.request(
        "POST",
        "/reports",
        Some(&token),
        Some(json!({
            "id": id, "type": "tear_gas", "lat": 35.6762, "lng": 139.6503,
            "occurredAt": Utc::now().to_rfc3339(),
        })),
    )
    .await;

    let (_, list) = app
        .request(
            "GET",
            &list_url(LAT - 0.1, LNG - 0.1, LAT + 0.1, LNG + 0.1),
            None,
            None,
        )
        .await;
    assert!(!list.as_array().unwrap().iter().any(|r| r["id"] == id));
}

/// Reports expire `REPORT_TTL_HOURS` after `occurredAt` - one that
/// happened well outside that window must not show up on the map anymore.
#[tokio::test]
#[serial_test::serial]
async fn list_reports_excludes_expired_ones() {
    let env = shared_test_env().await;
    let app = fresh_app(env).await;

    let token = app.sign_in("owner@example.com").await;
    let id = Uuid::new_v4().to_string();
    let occurred_at = Utc::now() - Duration::hours(7);
    app.request(
        "POST",
        "/reports",
        Some(&token),
        Some(json!({
            "id": id, "type": "tear_gas", "lat": LAT, "lng": LNG,
            "occurredAt": occurred_at.to_rfc3339(),
        })),
    )
    .await;

    let (_, list) = app
        .request(
            "GET",
            &list_url(LAT - 0.1, LNG - 0.1, LAT + 0.1, LNG + 0.1),
            None,
            None,
        )
        .await;
    assert!(!list.as_array().unwrap().iter().any(|r| r["id"] == id));
}
