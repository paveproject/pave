pub mod dto;
pub mod handlers;
pub mod headers;
pub mod service;
pub mod version_rules;

/// Merged into the top-level OpenAPI doc in `main.rs`.
#[derive(utoipa::OpenApi)]
#[openapi(
    paths(handlers::get_status),
    components(schemas(
        dto::AppPlatform,
        dto::VersionStatus,
        dto::AppVersionStatus,
        dto::StatusResponse
    ))
)]
pub struct ApiDoc;
