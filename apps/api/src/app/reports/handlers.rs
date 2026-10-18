use super::dto::{ReportsCreateRequest, ReportsListQuery, ReportsResponse};
use super::geohash_util;
use super::hub::{self, ReportsHub};
use super::rate_limit;
use super::ws_dto::{ReportsClientMessage, ReportsServerMessage};
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Query, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::Duration;
use db_rs::sea_orm_active_enums::ReportTypeEnum;
use sea_orm::prelude::DateTimeWithTimeZone;
use sea_orm::{ActiveEnum, ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use std::collections::HashSet;
use tokio::sync::mpsc;

/// How long a report stays visible on the map after it happened. A fixed
/// constant for v1 - may end up varying by `ReportType` later (e.g. an arrest
/// report probably shouldn't expire as fast as a tear-gas one).
const REPORT_TTL_HOURS: i64 = 6;

#[derive(Debug, FromQueryResult)]
struct ReportRow {
    id: String,
    r#type: ReportTypeEnum,
    lng: f64,
    lat: f64,
    occurred_at: DateTimeWithTimeZone,
    expires_at: DateTimeWithTimeZone,
}

impl From<ReportRow> for ReportsResponse {
    fn from(row: ReportRow) -> Self {
        ReportsResponse {
            id: row.id,
            r#type: row.r#type.into(),
            lat: row.lat,
            lng: row.lng,
            occurred_at: row.occurred_at.to_rfc3339(),
            expires_at: row.expires_at.to_rfc3339(),
        }
    }
}

#[utoipa::path(
    post,
    path = "/reports",
    tag = "Reports",
    request_body = ReportsCreateRequest,
    responses((status = 200, description = "Report recorded (a repeat of the same id is a no-op)", body = ReportsResponse))
)]
pub async fn create_report(
    State(mut state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<ReportsCreateRequest>,
) -> impl IntoResponse {
    if rate_limit::check_report_rate_limit(&mut state.redis, &session.user.id)
        .await
        .is_err()
    {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            "too many reports created recently, try again later",
        )
            .into_response();
    }

    let report_type: ReportTypeEnum = body.r#type.clone().into();
    let expires_at = body.occurred_at + Duration::hours(REPORT_TTL_HOURS);

    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        INSERT INTO report (id, type, location, occurred_at, expires_at)
        VALUES ($1, $2::report_type_enum, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6)
        ON CONFLICT (id) DO NOTHING
        "#,
        [
            body.id.clone().into(),
            report_type.to_value().into(),
            body.lng.into(),
            body.lat.into(),
            body.occurred_at.into(),
            expires_at.into(),
        ],
    );
    state
        .db
        .execute_raw(stmt)
        .await
        .expect("failed to insert report");

    let response = ReportsResponse {
        id: body.id,
        r#type: body.r#type,
        lat: body.lat,
        lng: body.lng,
        occurred_at: body.occurred_at.to_rfc3339(),
        expires_at: expires_at.to_rfc3339(),
    };

    // Fans out over Redis to every pod watching this area (see `hub.rs`) -
    // a repeat id still republishes, harmless since client-side merging
    // by id is idempotent.
    let cells = geohash_util::cells_for_point(response.lat, response.lng);
    state
        .reports_hub
        .publish(cells, ReportsServerMessage::ReportCreated(response.clone()));

    Json(response).into_response()
}

#[utoipa::path(
    get,
    path = "/reports",
    tag = "Reports",
    params(ReportsListQuery),
    responses((status = 200, description = "Non-expired reports within the given bounding box", body = Vec<ReportsResponse>))
)]
pub async fn list_reports(
    State(state): State<AppState>,
    Query(query): Query<ReportsListQuery>,
) -> impl IntoResponse {
    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        SELECT
            id,
            type,
            ST_X(location) AS lng,
            ST_Y(location) AS lat,
            occurred_at,
            expires_at
        FROM report
        WHERE expires_at > now()
          AND ST_Within(location, ST_MakeEnvelope($1, $2, $3, $4, 4326))
        ORDER BY occurred_at DESC
        "#,
        [
            query.min_lng.into(),
            query.min_lat.into(),
            query.max_lng.into(),
            query.max_lat.into(),
        ],
    );

    let rows = ReportRow::find_by_statement(stmt)
        .all(&state.db)
        .await
        .expect("failed to query reports");

    Json(
        rows.into_iter()
            .map(ReportsResponse::from)
            .collect::<Vec<_>>(),
    )
}

/// Live feed of newly created reports for the client's current viewport.
/// Not part of the OpenAPI `paths` (no REST shape for a websocket) -
/// `ReportsClientMessage`/`ReportsServerMessage` are still registered as
/// schemas so the generated TS client stays type-safe for both ends.
pub async fn reports_ws(State(state): State<AppState>, ws: WebSocketUpgrade) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.reports_hub))
}

async fn handle_socket(socket: WebSocket, reports_hub: ReportsHub) {
    use futures_util::{SinkExt, StreamExt};

    let conn_id = hub::next_connection_id();
    let (tx, mut rx) = mpsc::unbounded_channel::<ReportsServerMessage>();
    reports_hub.register(conn_id, tx);

    let (mut sink, mut stream) = socket.split();

    loop {
        tokio::select! {
            incoming = stream.next() => {
                let Some(Ok(message)) = incoming else { break };
                match message {
                    Message::Text(text) => {
                        if let Ok(ReportsClientMessage::Subscribe(query)) =
                            serde_json::from_str::<ReportsClientMessage>(text.as_str())
                        {
                            let cells: HashSet<String> = geohash_util::cells_for_bbox(&query);
                            reports_hub.set_interest(conn_id, cells);
                        }
                    }
                    Message::Close(_) => break,
                    _ => {}
                }
            }
            outgoing = rx.recv() => {
                let Some(outgoing) = outgoing else { break };
                let Ok(text) = serde_json::to_string(&outgoing) else { continue };
                if sink.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    }

    reports_hub.deregister(conn_id);
}
