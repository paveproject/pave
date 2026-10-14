use crate::config::ApiConfig;

/// The only media folder pave has today - add more consts here (not a
/// stringly-typed literal at each call site) the day a second one exists.
pub const AVATARS_FOLDER: &str = "avatars";

/// Resolves a stored media reference (avatar, ...) into a URL the client
/// can load directly.
///
/// The DB only ever stores a bare filename for anything pave uploaded
/// itself - never a folder path, never the bucket or endpoint - so
/// changing `S3_PUBLIC_ENDPOINT`/`S3_BUCKET_PUBLIC` later (a new bucket, a
/// CDN in front of it, ...) is an env var change, not a data migration.
/// An OAuth-provided avatar (Google/Apple sign-in) is already a full
/// external URL and is returned as-is instead of being treated as one of
/// our own filenames.
pub fn resolve_media_url(value: Option<&str>, folder: &str, config: &ApiConfig) -> Option<String> {
    let value = value?;
    if value.starts_with("http://") || value.starts_with("https://") {
        return Some(value.to_string());
    }
    Some(format!(
        "{}/{}/{}/{}",
        config.s3_public_endpoint(),
        config.s3_bucket_public,
        folder,
        value
    ))
}
