use super::dto::{CreateReportRequest, ListReportsQuery, ReportResponse};
use crate::entities::sea_orm_active_enums::ReportTypeEnum;
use crate::state::AppState;
use axum::extract::{Query, State};
use axum::response::IntoResponse;
use axum::Json;
use chrono::Duration;
use sea_orm::prelude::DateTimeWithTimeZone;
use sea_orm::{ActiveEnum, ConnectionTrait, DatabaseBackend, FromQueryResult, Statement};

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

impl From<ReportRow> for ReportResponse {
    fn from(row: ReportRow) -> Self {
        ReportResponse {
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
    request_body = CreateReportRequest,
    responses((status = 200, description = "Report recorded (a repeat of the same id is a no-op)", body = ReportResponse))
)]
pub async fn create_report(
    State(state): State<AppState>,
    Json(body): Json<CreateReportRequest>,
) -> impl IntoResponse {
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

    Json(ReportResponse {
        id: body.id,
        r#type: body.r#type,
        lat: body.lat,
        lng: body.lng,
        occurred_at: body.occurred_at.to_rfc3339(),
        expires_at: expires_at.to_rfc3339(),
    })
}

#[utoipa::path(
    get,
    path = "/reports",
    tag = "Reports",
    params(ListReportsQuery),
    responses((status = 200, description = "Non-expired reports within the given bounding box", body = Vec<ReportResponse>))
)]
pub async fn list_reports(
    State(state): State<AppState>,
    Query(query): Query<ListReportsQuery>,
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
            .map(ReportResponse::from)
            .collect::<Vec<_>>(),
    )
}
