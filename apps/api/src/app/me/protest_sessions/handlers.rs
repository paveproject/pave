use super::dto::{
    MeProtestSessionCreateRequest, MeProtestSessionEndRequest, MeProtestSessionResponse,
    MeProtestUploadKind, MeProtestUploadResponse,
};
use crate::libs::media;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Multipart, Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::Utc;
use db_rs::protest_session;
use db_rs::protest_upload;
use db_rs::sea_orm_active_enums::ProtestUploadKindEnum;
use sea_orm::sea_query::OnConflict;
use sea_orm::{
    ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, IntoActiveModel, QueryFilter,
};
use uuid::Uuid;

fn to_response(model: protest_session::Model) -> MeProtestSessionResponse {
    MeProtestSessionResponse {
        id: model.id.to_string(),
        started_at: model.started_at.to_rfc3339(),
        ended_at: model.ended_at.map(|t| t.to_rfc3339()),
    }
}

/// Idempotent create: a repeat call with the same id (the client retrying
/// after a flaky connection, or just re-pushing an already-synced local
/// session) is a no-op, not an error - see `dto`'s own doc comment for why
/// the id is client-supplied at all.
#[utoipa::path(
    put,
    path = "/me/protest-sessions/{id}",
    tag = "Me",
    request_body = MeProtestSessionCreateRequest,
    responses(
        (status = 200, description = "Session created, or already existed for this caller", body = MeProtestSessionResponse),
        (status = 404, description = "That id belongs to a different account")
    )
)]
pub async fn create_or_get_session(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
    Json(body): Json<MeProtestSessionCreateRequest>,
) -> impl IntoResponse {
    protest_session::Entity::insert(protest_session::ActiveModel {
        id: Set(id),
        owner_user_id: Set(session.user.id.clone()),
        started_at: Set(body.started_at.into()),
        ended_at: Set(None),
        created_at: Set(Utc::now().into()),
    })
    .on_conflict(
        OnConflict::column(protest_session::Column::Id)
            .do_nothing()
            .to_owned(),
    )
    // Same reasoning as `system::service::update_version_policy` - the
    // `DO NOTHING` branch's zero-rows-affected has no row to return.
    .exec_without_returning(&state.db)
    .await
    .expect("failed to insert protest session");

    // Separate from the insert above so a repeat with someone else's id
    // (impossible to cause honestly, but never trust the client) is
    // caught here rather than silently treated as "already synced".
    let Some(model) = protest_session::Entity::find_by_id(id)
        .filter(protest_session::Column::OwnerUserId.eq(session.user.id.clone()))
        .one(&state.db)
        .await
        .expect("failed to query protest session")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    Json(to_response(model)).into_response()
}

#[utoipa::path(
    patch,
    path = "/me/protest-sessions/{id}",
    tag = "Me",
    request_body = MeProtestSessionEndRequest,
    responses(
        (status = 200, description = "Session marked ended", body = MeProtestSessionResponse),
        (status = 404, description = "Not found, or not owned by the caller")
    )
)]
pub async fn end_session(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
    Json(body): Json<MeProtestSessionEndRequest>,
) -> impl IntoResponse {
    let Some(model) = protest_session::Entity::find_by_id(id)
        .filter(protest_session::Column::OwnerUserId.eq(session.user.id.clone()))
        .one(&state.db)
        .await
        .expect("failed to query protest session")
    else {
        return StatusCode::NOT_FOUND.into_response();
    };

    let mut active = model.into_active_model();
    active.ended_at = Set(Some(body.ended_at.into()));
    let updated = active
        .update(&state.db)
        .await
        .expect("failed to end protest session");

    Json(to_response(updated)).into_response()
}

const ALLOWED_UPLOAD_KINDS: &[&str] = &["position_batch", "audio_chunk"];

/// Multipart: a `kind` text field (`position_batch`/`audio_chunk`) plus a
/// `file` field carrying the already-encrypted blob (encrypted client-side
/// with the account's DEK - see mobile `lib/recoveryKey/dekCipher.ts`).
/// Stored opaque in the private bucket; this server never decrypts it.
#[utoipa::path(
    post,
    path = "/me/protest-sessions/{id}/uploads",
    tag = "Me",
    responses(
        (status = 200, description = "Upload stored", body = MeProtestUploadResponse),
        (status = 400, description = "Missing/invalid kind field or no file uploaded"),
        (status = 404, description = "Session not found, or not owned by the caller")
    )
)]
pub async fn upload(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<Uuid>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let owns_session = protest_session::Entity::find_by_id(id)
        .filter(protest_session::Column::OwnerUserId.eq(session.user.id.clone()))
        .one(&state.db)
        .await
        .expect("failed to query protest session")
        .is_some();
    if !owns_session {
        return StatusCode::NOT_FOUND.into_response();
    }

    let mut kind = None;
    let mut body_bytes = None;

    while let Ok(Some(field)) = multipart.next_field().await {
        match field.name() {
            Some("kind") => {
                kind = Some(field.text().await.expect("failed to read kind field"));
            }
            Some("file") => {
                body_bytes = Some(field.bytes().await.expect("failed to read uploaded file"));
            }
            _ => {}
        }
    }

    let Some(kind) = kind.filter(|k| ALLOWED_UPLOAD_KINDS.contains(&k.as_str())) else {
        return (StatusCode::BAD_REQUEST, "missing or invalid kind field").into_response();
    };
    let Some(body_bytes) = body_bytes else {
        return (StatusCode::BAD_REQUEST, "no file uploaded").into_response();
    };

    let kind_enum = if kind == "position_batch" {
        ProtestUploadKindEnum::PositionBatch
    } else {
        ProtestUploadKindEnum::AudioChunk
    };

    let upload_id = Uuid::new_v4();
    let key = format!("{}/{}/{}", media::PROTEST_SESSIONS_FOLDER, id, upload_id);
    let size = body_bytes.len() as i32;

    state
        .s3
        .put_object()
        .bucket(&state.config.s3_bucket_private)
        .key(&key)
        .body(aws_sdk_s3::primitives::ByteStream::from(
            body_bytes.to_vec(),
        ))
        .send()
        .await
        .expect("failed to upload protest-session blob");

    protest_upload::Entity::insert(protest_upload::ActiveModel {
        id: Set(upload_id),
        session_id: Set(id),
        kind: Set(kind_enum),
        s3_key: Set(key),
        size: Set(size),
        created_at: Set(Utc::now().into()),
    })
    .exec(&state.db)
    .await
    .expect("failed to record protest upload");

    Json(MeProtestUploadResponse {
        id: upload_id.to_string(),
        kind: MeProtestUploadKind::from(kind_enum),
    })
    .into_response()
}
