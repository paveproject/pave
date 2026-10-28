use super::dto::{ReportsCreateRequest, ReportsListQuery, ReportsResponse};
use super::geohash_util;
use super::grouping::{self, ReportCluster};
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
use sea_orm::{ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};
use std::collections::HashSet;
use tokio::sync::mpsc;

/// How long a report stays visible on the map after it happened. A fixed
/// constant for v1 - may end up varying by report type later (e.g. an arrest
/// report probably shouldn't expire as fast as a tear-gas one).
const REPORT_TTL_HOURS: i64 = 6;

#[derive(FromQueryResult)]
struct EnabledType {
    exists: bool,
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

    // The FK on report.type would surface an unknown key as a raw DB error, so
    // check it here and answer 400 for a key the taxonomy doesn't have. One
    // extra round-trip per report - cache the enabled set in state if it ever
    // shows up in a profile.
    let lookup = EnabledType::find_by_statement(Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"SELECT EXISTS (
             SELECT 1 FROM report_type WHERE key = $1 AND enabled
           ) AS "exists""#,
        [body.r#type.clone().into()],
    ))
    .one(&state.db)
    .await;

    match lookup {
        Ok(Some(row)) if row.exists => {}
        Ok(_) => {
            return (StatusCode::BAD_REQUEST, "unknown or disabled report type").into_response();
        }
        // Kept distinct from the 400 above on purpose: swallowing this into
        // "unknown type" once made an unapplied migration look like every
        // client sending a bad payload, which is a long way to debug.
        Err(error) => {
            tracing::error!(?error, "failed to look up the report type");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not validate the report type",
            )
                .into_response();
        }
    }

    let expires_at = body.occurred_at + Duration::hours(REPORT_TTL_HOURS);

    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        r#"
        INSERT INTO report (id, type, location, occurred_at, expires_at)
        VALUES ($1::uuid, $2::text, ST_SetSRID(ST_MakePoint($3, $4), 4326), $5, $6)
        ON CONFLICT (id) DO NOTHING
        "#,
        [
            body.id.clone().into(),
            body.r#type.clone().into(),
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
        // A freshly created report is always one concrete type, never a family
        // bucket - only the clustered list produces those.
        kind: "type".to_string(),
        lat: body.lat,
        lng: body.lng,
        occurred_at: body.occurred_at.to_rfc3339(),
        expires_at: expires_at.to_rfc3339(),
        count: 1,
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

/// Grouped by family - six buckets instead of twenty-nine, for a viewport wide
/// enough that the precise type isn't what a reader needs yet.
///
/// The label still falls back to the type whenever a cell holds only one:
/// "Aid, 1" is strictly worse than "Medical, 1", and "Force used, 12" worse
/// than "Tear gas, 12". Only a genuine mix inside one family has anything to
/// summarise, so only a mix is labelled as one.
const REPORTS_BY_FAMILY_SQL: &str = r#"
    WITH cells AS (
        SELECT
            rt.family_key                     AS bucket,
            ST_SnapToGrid(r.location, $5, $5) AS cell,
            count(*)                          AS n,
            count(DISTINCT r.type)            AS kinds,
            min(r.type)                       AS lone_type,
            avg(ST_X(r.location))             AS lng,
            avg(ST_Y(r.location))             AS lat,
            max(r.occurred_at)                AS occurred_at,
            max(r.expires_at)                 AS expires_at,
            min(r.id::text)                   AS lone_id
        FROM report r
        JOIN report_type rt ON rt.key = r.type
        WHERE r.expires_at > now()
          AND ST_Within(r.location, ST_MakeEnvelope($1, $2, $3, $4, 4326))
        GROUP BY rt.family_key, ST_SnapToGrid(r.location, $5, $5)
    ),
    labelled AS (
        SELECT *,
            CASE WHEN kinds = 1 THEN lone_type ELSE bucket END AS label,
            CASE WHEN kinds = 1 THEN 'type'    ELSE 'family' END AS kind
        FROM cells
    )
    SELECT
        CASE WHEN n = 1 THEN lone_id
             ELSE label || '@' || ST_X(cell)::text || ',' || ST_Y(cell)::text
        END          AS id,
        label        AS type,
        kind,
        lng, lat, occurred_at, expires_at,
        n            AS count
    FROM labelled
    ORDER BY n DESC
    LIMIT $6
"#;

/// Grouped by type, for a viewport tight enough that the distinction matters.
const REPORTS_BY_TYPE_SQL: &str = r#"
    WITH cells AS (
        SELECT
            r.type                            AS bucket,
            ST_SnapToGrid(r.location, $5, $5) AS cell,
            count(*)                          AS n,
            avg(ST_X(r.location))             AS lng,
            avg(ST_Y(r.location))             AS lat,
            max(r.occurred_at)                AS occurred_at,
            max(r.expires_at)                 AS expires_at,
            min(r.id::text)                   AS lone_id
        FROM report r
        WHERE r.expires_at > now()
          AND ST_Within(r.location, ST_MakeEnvelope($1, $2, $3, $4, 4326))
        GROUP BY r.type, ST_SnapToGrid(r.location, $5, $5)
    )
    SELECT
        CASE WHEN n = 1 THEN lone_id
             ELSE bucket || '@' || ST_X(cell)::text || ',' || ST_Y(cell)::text
        END          AS id,
        bucket       AS type,
        'type'       AS kind,
        lng, lat, occurred_at, expires_at,
        n            AS count
    FROM cells
    ORDER BY n DESC
    LIMIT $6
"#;

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
    let cell = grouping::cell_size_degrees(query.min_lng, query.max_lng);
    let by_family = grouping::groups_by_family(cell);

    // Grouped by Postgres, not in this process. Returning every row in the
    // viewport meant 84k rows for a Paris-wide view over 100k reports, and the
    // pairwise grouping that followed was O(n²). Snapping to a grid sized from
    // the viewport keeps the answer around a thousand rows at every zoom, and
    // costs one hash aggregate over a set the GiST index already narrowed.
    //
    // `type` is part of the grouping key on purpose: a count that mixes
    // `live_ammunition` with `safe_route` says nothing a reader can use.
    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        if by_family {
            REPORTS_BY_FAMILY_SQL
        } else {
            REPORTS_BY_TYPE_SQL
        },
        [
            query.min_lng.into(),
            query.min_lat.into(),
            query.max_lng.into(),
            query.max_lat.into(),
            cell.into(),
            i64::from(grouping::MAX_MARKERS).into(),
        ],
    );

    let clusters = match ReportCluster::find_by_statement(stmt).all(&state.db).await {
        Ok(clusters) => clusters,
        Err(error) => {
            tracing::error!(?error, "failed to query reports");
            return (StatusCode::INTERNAL_SERVER_ERROR, "could not load reports").into_response();
        }
    };

    Json(
        clusters
            .into_iter()
            .map(|c| ReportsResponse {
                id: c.id,
                r#type: c.r#type,
                lat: c.lat,
                lng: c.lng,
                kind: c.kind,
                occurred_at: c.occurred_at.to_rfc3339(),
                expires_at: c.expires_at.to_rfc3339(),
                count: c.count.max(1) as u32,
            })
            .collect::<Vec<_>>(),
    )
    .into_response()
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
