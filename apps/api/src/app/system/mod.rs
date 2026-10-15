pub mod dto;
pub mod handlers;
pub mod headers;
pub mod service;
pub mod version_rules;

/// This module's own slice of the OpenAPI doc - merged into the top-level
/// one in `main.rs`, so adding a path/schema here never requires touching
/// that file.
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
