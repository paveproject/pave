pub mod handlers;

use crate::state::AppState;
use axum::routing::get;
use axum::Router;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(handlers::list_my_data_access_requests))
}

#[derive(utoipa::OpenApi)]
#[openapi(paths(handlers::list_my_data_access_requests))]
pub struct ApiDoc;
