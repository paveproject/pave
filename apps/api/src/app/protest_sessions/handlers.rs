use super::dto::{
    ProtestBlobResponse, ProtestSessionEndRequest, ProtestSessionResponse,
    ProtestSessionUpsertRequest,
};
use crate::app::access::can_read_owner;
use crate::libs::media;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::{Multipart, Path, State};
use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use db_rs::sea_orm_active_enums::ProtestBlobKindEnum;
use db_rs::{protest_blob, protest_session};
use sea_orm::{ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter, QueryOrder};
use uuid::Uuid;

/// Only the two read handlers use this. Every write keeps
/// `find_owned_session`, so a grant never becomes write access.
async fn find_readable_session(
    state: &AppState,
    session: &CurrentSession<AppAuthSchema>,
    session_id: Uuid,
) -> Result<Option<protest_session::Model>, sea_orm::DbErr> {
    let Some(row) = protest_session::Entity::find_by_id(session_id)
        .one(&state.db)
        .await?
    else {
        return Ok(None);
    };

    Ok(can_read_owner(&state.db, session, &row.owner_user_id)
        .await
        .then_some(row))
}

/// A session id the caller doesn't own must look absent, not forbidden: a 403
/// would confirm someone else's session exists under that id.
async fn find_owned_session(
    db: &sea_orm::DatabaseConnection,
    session_id: Uuid,
    user_id: &str,
) -> Result<Option<protest_session::Model>, sea_orm::DbErr> {
    protest_session::Entity::find_by_id(session_id)
        .filter(protest_session::Column::OwnerUserId.eq(user_id))
        .one(db)
        .await
}

fn kind_label(kind: &ProtestBlobKindEnum) -> &'static str {
    match kind {
        ProtestBlobKindEnum::PositionBatch => "position_batch",
        ProtestBlobKindEnum::AudioChunk => "audio_chunk",
    }
}

fn parse_kind(raw: &str) -> Option<ProtestBlobKindEnum> {
    match raw {
        "position_batch" => Some(ProtestBlobKindEnum::PositionBatch),
        "audio_chunk" => Some(ProtestBlobKindEnum::AudioChunk),
        _ => None,
    }
}

pub(crate) fn to_response(
    session: protest_session::Model,
    blobs: Vec<protest_blob::Model>,
) -> ProtestSessionResponse {
    ProtestSessionResponse {
        id: session.id.to_string(),
        active: session.active,
        sealed_key: session.sealed_key,
        metadata: session.metadata,
        blobs: blobs
            .into_iter()
            .map(|blob| ProtestBlobResponse {
                id: blob.id.to_string(),
                kind: kind_label(&blob.kind).to_string(),
                size: blob.size,
                seq: blob.seq,
            })
            .collect(),
    }
}

/// Create-or-get, keyed on the client-minted id so the outbox can replay it.
///
/// A second *active* session is refused by
/// `idx_protest_session_one_active_per_owner`, not by a check here: two
/// devices starting at once would race between a SELECT and an INSERT. The
/// unique violation is mapped to 409.
#[utoipa::path(
    put,
    path = "/protest-session/{protest_session_id}",
    tag = "ProtestSessions",
    params(("protest_session_id" = String, Path, description = "Client-minted session id")),
    request_body = ProtestSessionUpsertRequest,
    responses(
        (status = 200, description = "Session created, or already existed", body = ProtestSessionResponse),
        (status = 409, description = "Another session is still active for this account"),
    )
)]
pub async fn upsert_session(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<String>,
    Json(body): Json<ProtestSessionUpsertRequest>,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();
    let Ok(session_id) = Uuid::parse_str(&id) else {
        return (StatusCode::BAD_REQUEST, "id must be a uuid").into_response();
    };

    match find_owned_session(&state.db, session_id, &user_id).await {
        Ok(Some(existing)) => {
            // A real upsert, not a read-through: a DEK rotation re-seals
            // every session key, and without this the stored envelope would
            // stay sealed under a DEK that no longer exists anywhere.
            let updated = protest_session::Entity::update(protest_session::ActiveModel {
                id: Set(existing.id),
                sealed_key: Set(body.sealed_key),
                metadata: Set(body.metadata),
                ..Default::default()
            })
            .exec(&state.db)
            .await;

            return match updated {
                Ok(row) => {
                    let blobs = load_blobs(&state.db, session_id).await;
                    Json(to_response(row, blobs)).into_response()
                }
                Err(error) => {
                    tracing::error!(?error, "failed to update the protest session");
                    (
                        StatusCode::INTERNAL_SERVER_ERROR,
                        "could not update the session",
                    )
                        .into_response()
                }
            };
        }
        Ok(None) => {}
        Err(error) => {
            tracing::error!(?error, "failed to look up the protest session");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not read the session",
            )
                .into_response();
        }
    }

    let insert = protest_session::Entity::insert(protest_session::ActiveModel {
        id: Set(session_id),
        owner_user_id: Set(user_id.clone()),
        active: Set(true),
        sealed_key: Set(body.sealed_key),
        metadata: Set(body.metadata),
    })
    .exec(&state.db)
    .await;

    if let Err(error) = insert {
        // The partial unique index firing is a client-recoverable "close your
        // other session first"; any other DB error is ours.
        let message = error.to_string();
        if message.contains("idx_protest_session_one_active_per_owner") {
            return (
                StatusCode::CONFLICT,
                "another protest session is still active for this account",
            )
                .into_response();
        }
        // A session exists under this id and isn't the caller's. Answer as
        // absent: a 500 here is an error anyone with a readable grant could
        // trigger at will.
        if message.contains("protest_session_pkey") {
            return (StatusCode::NOT_FOUND, "no such session").into_response();
        }
        tracing::error!(?error, "failed to create the protest session");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "could not create the session",
        )
            .into_response();
    }

    match find_owned_session(&state.db, session_id, &user_id).await {
        Ok(Some(created)) => Json(to_response(created, Vec::new())).into_response(),
        Ok(None) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            "session vanished after insert",
        )
            .into_response(),
        Err(error) => {
            tracing::error!(?error, "failed to read back the protest session");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not read the session",
            )
                .into_response()
        }
    }
}

pub(crate) async fn load_blobs(
    db: &sea_orm::DatabaseConnection,
    session_id: Uuid,
) -> Vec<protest_blob::Model> {
    protest_blob::Entity::find()
        .filter(protest_blob::Column::SessionId.eq(session_id))
        .order_by_asc(protest_blob::Column::Seq)
        .all(db)
        .await
        .unwrap_or_default()
}

#[utoipa::path(
    patch,
    path = "/protest-session/{protest_session_id}",
    tag = "ProtestSessions",
    params(("protest_session_id" = String, Path, description = "Session id")),
    request_body = ProtestSessionEndRequest,
    responses(
        (status = 200, description = "Session closed", body = ProtestSessionResponse),
        (status = 404, description = "No such session for this account"),
    )
)]
pub async fn end_session(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<String>,
    Json(body): Json<ProtestSessionEndRequest>,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();
    let Ok(session_id) = Uuid::parse_str(&id) else {
        return (StatusCode::BAD_REQUEST, "id must be a uuid").into_response();
    };

    let existing = match find_owned_session(&state.db, session_id, &user_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return (StatusCode::NOT_FOUND, "no such session").into_response(),
        Err(error) => {
            tracing::error!(?error, "failed to look up the protest session");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not read the session",
            )
                .into_response();
        }
    };

    // Closing a closed session returns 200, so a replayed push isn't an
    // error.
    let updated = protest_session::Entity::update(protest_session::ActiveModel {
        id: Set(existing.id),
        active: Set(false),
        metadata: Set(body.metadata),
        ..Default::default()
    })
    .exec(&state.db)
    .await;

    match updated {
        Ok(row) => {
            let blobs = load_blobs(&state.db, session_id).await;
            Json(to_response(row, blobs)).into_response()
        }
        Err(error) => {
            tracing::error!(?error, "failed to close the protest session");
            (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not close the session",
            )
                .into_response()
        }
    }
}

/// One session with its blob index, for reading a recording back on a device
/// that doesn't hold the local rows. The payloads come separately, through
/// `download_blob`.
#[utoipa::path(
    get,
    path = "/protest-session/{protest_session_id}",
    tag = "ProtestSessions",
    params(("protest_session_id" = String, Path, description = "Session id")),
    responses(
        (status = 200, description = "The session and its blob index", body = ProtestSessionResponse),
        (status = 404, description = "No such session for this account")
    )
)]
pub async fn get_session(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let Ok(session_id) = Uuid::parse_str(&id) else {
        return (StatusCode::BAD_REQUEST, "id must be a uuid").into_response();
    };

    let existing = match find_readable_session(&state, &session, session_id).await {
        Ok(Some(row)) => row,
        Ok(None) => return (StatusCode::NOT_FOUND, "no such session").into_response(),
        Err(error) => {
            tracing::error!(?error, "failed to look up the protest session");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not read the session",
            )
                .into_response();
        }
    };

    let blobs = load_blobs(&state.db, session_id).await;
    Json(to_response(existing, blobs)).into_response()
}

/// Idempotent blob upload, keyed on the client-minted `blob_id`.
///
/// Multipart rather than JSON because the payload is raw ciphertext, and
/// proxied rather than presigned because this bucket is never addressable by
/// URL (see `s3_bucket_private` in `config.rs`).
#[utoipa::path(
    put,
    path = "/protest-session/{protest_session_id}/blob/{blob_id}",
    tag = "ProtestSessions",
    params(
        ("protest_session_id" = String, Path, description = "Session id"),
        ("blob_id" = String, Path, description = "Client-minted blob id"),
    ),
    responses(
        (status = 200, description = "Blob stored, or already was", body = ProtestBlobResponse),
        (status = 404, description = "No such session for this account"),
    )
)]
pub async fn upload_blob(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path((id, blob_id)): Path<(String, String)>,
    mut multipart: Multipart,
) -> impl IntoResponse {
    let user_id = session.user.id.clone();
    let (Ok(session_id), Ok(blob_uuid)) = (Uuid::parse_str(&id), Uuid::parse_str(&blob_id)) else {
        return (StatusCode::BAD_REQUEST, "ids must be uuids").into_response();
    };

    // Before anything is read or written, so an unauthorized caller never
    // gets as far as putting bytes in the bucket.
    match find_owned_session(&state.db, session_id, &user_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, "no such session").into_response(),
        Err(error) => {
            tracing::error!(?error, "failed to look up the protest session");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not read the session",
            )
                .into_response();
        }
    }

    match protest_blob::Entity::find_by_id(blob_uuid)
        .one(&state.db)
        .await
    {
        Ok(Some(existing)) if existing.session_id == session_id => {
            return Json(ProtestBlobResponse {
                id: existing.id.to_string(),
                kind: kind_label(&existing.kind).to_string(),
                size: existing.size,
                seq: existing.seq,
            })
            .into_response();
        }
        Ok(Some(_)) => return (StatusCode::NOT_FOUND, "no such session").into_response(),
        Ok(None) => {}
        Err(error) => {
            tracing::error!(?error, "failed to look up the protest blob");
            return (StatusCode::INTERNAL_SERVER_ERROR, "could not read the blob").into_response();
        }
    }

    let mut kind: Option<ProtestBlobKindEnum> = None;
    let mut seq: Option<i32> = None;
    let mut bytes: Option<Vec<u8>> = None;

    loop {
        match multipart.next_field().await {
            Ok(Some(field)) => match field.name().unwrap_or_default() {
                "kind" => {
                    let raw = field.text().await.unwrap_or_default();
                    match parse_kind(&raw) {
                        Some(parsed) => kind = Some(parsed),
                        None => {
                            return (StatusCode::BAD_REQUEST, "unknown blob kind").into_response()
                        }
                    }
                }
                "seq" => {
                    let raw = field.text().await.unwrap_or_default();
                    match raw.parse::<i32>() {
                        Ok(parsed) => seq = Some(parsed),
                        Err(_) => {
                            return (StatusCode::BAD_REQUEST, "seq must be an integer")
                                .into_response()
                        }
                    }
                }
                "file" => match field.bytes().await {
                    Ok(read) => bytes = Some(read.to_vec()),
                    Err(error) => {
                        tracing::error!(?error, "failed to read the uploaded blob");
                        return (StatusCode::BAD_REQUEST, "could not read the file")
                            .into_response();
                    }
                },
                _ => {}
            },
            Ok(None) => break,
            Err(error) => {
                tracing::error!(?error, "malformed multipart upload");
                return (StatusCode::BAD_REQUEST, "malformed upload").into_response();
            }
        }
    }

    let (Some(kind), Some(seq), Some(bytes)) = (kind, seq, bytes) else {
        return (
            StatusCode::BAD_REQUEST,
            "kind, seq and file are all required",
        )
            .into_response();
    };

    let key = format!(
        "{}/{}/{}",
        media::PROTEST_SESSIONS_FOLDER,
        session_id,
        blob_uuid
    );

    // `?` rather than the avatar path's `.expect()`: the outbox retries a
    // 500, where a panic loses the blob.
    if let Err(error) = state
        .s3
        .put_object()
        .bucket(&state.config.s3_bucket_private)
        .key(&key)
        .body(aws_sdk_s3::primitives::ByteStream::from(bytes.clone()))
        .content_type("application/octet-stream")
        .send()
        .await
    {
        tracing::error!(?error, "failed to upload the protest blob");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "could not store the blob",
        )
            .into_response();
    }

    let size = i32::try_from(bytes.len()).unwrap_or(i32::MAX);
    let insert = protest_blob::Entity::insert(protest_blob::ActiveModel {
        id: Set(blob_uuid),
        session_id: Set(session_id),
        kind: Set(kind),
        s3_key: Set(key),
        size: Set(size),
        seq: Set(seq),
    })
    .exec(&state.db)
    .await;

    if let Err(error) = insert {
        let message = error.to_string();
        if message.contains("unique_protest_blob_session_seq") {
            return (
                StatusCode::CONFLICT,
                "that sequence number is already taken in this session",
            )
                .into_response();
        }
        tracing::error!(?error, "failed to record the protest blob");
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            "could not record the blob",
        )
            .into_response();
    }

    Json(ProtestBlobResponse {
        id: blob_uuid.to_string(),
        kind: kind_label(&kind).to_string(),
        size,
        seq,
    })
    .into_response()
}

/// The private bucket has no public URL, so reading a blob goes through here.
#[utoipa::path(
    get,
    path = "/protest-session/{protest_session_id}/blob/{blob_id}",
    tag = "ProtestSessions",
    params(
        ("protest_session_id" = String, Path, description = "Session id"),
        ("blob_id" = String, Path, description = "Blob id"),
    ),
    responses(
        (status = 200, description = "The blob's ciphertext", content_type = "application/octet-stream"),
        (status = 404, description = "No such session or blob for this account"),
    )
)]
pub async fn download_blob(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Path((id, blob_id)): Path<(String, String)>,
) -> impl IntoResponse {
    let (Ok(session_id), Ok(blob_uuid)) = (Uuid::parse_str(&id), Uuid::parse_str(&blob_id)) else {
        return (StatusCode::BAD_REQUEST, "ids must be uuids").into_response();
    };

    match find_readable_session(&state, &session, session_id).await {
        Ok(Some(_)) => {}
        Ok(None) => return (StatusCode::NOT_FOUND, "no such session").into_response(),
        Err(error) => {
            tracing::error!(?error, "failed to look up the protest session");
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                "could not read the session",
            )
                .into_response();
        }
    }

    let blob = match protest_blob::Entity::find_by_id(blob_uuid)
        .one(&state.db)
        .await
    {
        Ok(Some(row)) if row.session_id == session_id => row,
        Ok(_) => return (StatusCode::NOT_FOUND, "no such blob").into_response(),
        Err(error) => {
            tracing::error!(?error, "failed to look up the protest blob");
            return (StatusCode::INTERNAL_SERVER_ERROR, "could not read the blob").into_response();
        }
    };

    let object = state
        .s3
        .get_object()
        .bucket(&state.config.s3_bucket_private)
        .key(&blob.s3_key)
        .send()
        .await;

    let object = match object {
        Ok(object) => object,
        Err(error) => {
            tracing::error!(?error, key = %blob.s3_key, "failed to fetch the protest blob");
            return (StatusCode::INTERNAL_SERVER_ERROR, "could not read the blob").into_response();
        }
    };

    match object.body.collect().await {
        Ok(data) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/octet-stream")],
            data.into_bytes(),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(?error, "failed to read the protest blob stream");
            (StatusCode::INTERNAL_SERVER_ERROR, "could not read the blob").into_response()
        }
    }
}
