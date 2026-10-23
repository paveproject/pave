use super::dto::{
    MeRecoveryDekGenerationConflictResponse, MeRecoveryDekGenerationResponse,
    MeReserveRecoveryDekGenerationRequest,
};
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use better_auth::integrations::axum::CurrentSession;
use chrono::Utc;
use db_rs::recovery_dek_generation;
use sea_orm::{ActiveModelTrait, ActiveValue::Set, ColumnTrait, EntityTrait, QueryFilter};

/// A compare-and-swap guard around minting a new recovery DEK. Without
/// this, two of a user's own active devices reacting to the same event
/// (e.g. a sibling device being removed) can each independently generate
/// a *different* random DEK and seal it to the others - a silent,
/// permanent split with nothing in the data to reveal it happened.
///
/// `expected_generation` is whatever the caller's own local
/// `syncedState.generation` currently says (`0` if it's never synced at
/// all). The update only succeeds if that's still true server-side right
/// now; the first caller to land wins and the stored generation becomes
/// `expected_generation + 1`. Every other racing caller gets `409` with
/// the generation that actually won - at that point, the losing device
/// must abandon its own plan rather than retry with the same (now stale)
/// DEK: the winner will seal the real result to it shortly (see
/// `lib/recoveryKey`'s `receiveDek`, mobile-side).
#[utoipa::path(
    post,
    path = "/me/recovery-dek-generation/reserve",
    tag = "Me",
    request_body = MeReserveRecoveryDekGenerationRequest,
    responses(
        (status = 200, description = "Reservation won", body = MeRecoveryDekGenerationResponse),
        (status = 409, description = "Lost the race - another device already reserved this generation", body = MeRecoveryDekGenerationConflictResponse)
    )
)]
pub async fn reserve_recovery_dek_generation(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    Json(body): Json<MeReserveRecoveryDekGenerationRequest>,
) -> impl IntoResponse {
    let user_id = session.user.id;
    let expected = body.expected_generation;
    let next = expected + 1;

    // The common case: a row already exists and still matches what the
    // caller expects. Postgres's row-level locking on this UPDATE is what
    // actually makes this a safe CAS under concurrency - two requests
    // racing on the same `expected` value can't both succeed, since the
    // second one re-checks `generation = expected` against whatever the
    // first one just committed.
    let update_result = recovery_dek_generation::Entity::update_many()
        .col_expr(
            recovery_dek_generation::Column::Generation,
            sea_orm::sea_query::Expr::value(next),
        )
        .col_expr(
            recovery_dek_generation::Column::UpdatedAt,
            sea_orm::sea_query::Expr::value(Utc::now()),
        )
        .filter(recovery_dek_generation::Column::UserId.eq(user_id.clone()))
        .filter(recovery_dek_generation::Column::Generation.eq(expected))
        .exec(&state.db)
        .await
        .expect("failed to attempt recovery dek generation update");

    if update_result.rows_affected == 1 {
        return Json(MeRecoveryDekGenerationResponse { generation: next }).into_response();
    }

    // No row matched. Either this account has never reserved a generation
    // before (fine, as long as the caller's own belief - `expected` - was
    // the implicit starting point of `0`), or a genuine conflict: another
    // device already moved the generation past what this caller expected.
    if expected == 0 {
        let inserted = recovery_dek_generation::ActiveModel {
            user_id: Set(user_id.clone()),
            generation: Set(next),
            created_at: Set(Utc::now().into()),
            updated_at: Set(Utc::now().into()),
        }
        .insert(&state.db)
        .await;

        if inserted.is_ok() {
            return Json(MeRecoveryDekGenerationResponse { generation: next }).into_response();
        }
        // Lost an insert race against a concurrent first-ever reservation -
        // fall through to report the real current value below.
    }

    let current_generation = recovery_dek_generation::Entity::find_by_id(user_id)
        .one(&state.db)
        .await
        .expect("failed to query current recovery dek generation")
        .map(|model| model.generation)
        .unwrap_or(0);

    (
        StatusCode::CONFLICT,
        Json(MeRecoveryDekGenerationConflictResponse { current_generation }),
    )
        .into_response()
}
