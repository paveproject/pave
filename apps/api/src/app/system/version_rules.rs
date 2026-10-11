//! Pure version-comparison logic, no I/O. Rust port of Recomend's
//! `libs/rules/src/lib/app-version.rules.ts` - kept here rather than in a
//! shared lib since nothing else in this Rust API needs it, and (unlike
//! Recomend) the mobile app is TypeScript, not Rust, so there is no
//! language-boundary-crossing lib to share this with anyway.

use super::dto::VersionStatus;
use std::cmp::Ordering;

/// Versions are restricted to `\d+(\.\d+){0,2}` (e.g. "1", "1.9", "1.10.2") -
/// same pattern the `check_version_policy_version` constraint enforces in
/// Postgres (see `libs/db/src/lib/schemas/system.ts`). Deliberately not a
/// full semver parser: release-please tags and store version strings here
/// are always plain dotted numbers.
pub fn is_valid_version(value: &str) -> bool {
    let parts: Vec<&str> = value.split('.').collect();
    (1..=3).contains(&parts.len())
        && parts
            .iter()
            .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit()))
}

/// Compares two dotted numeric versions (e.g. "1.9" vs "1.10.2"), unequal
/// segment counts treated as zero-padded. Both inputs must already be
/// valid per [`is_valid_version`].
fn compare_versions(a: &str, b: &str) -> Ordering {
    let parts_a: Vec<u32> = a.split('.').map(|p| p.parse().unwrap_or(0)).collect();
    let parts_b: Vec<u32> = b.split('.').map(|p| p.parse().unwrap_or(0)).collect();

    for i in 0..parts_a.len().max(parts_b.len()) {
        let x = parts_a.get(i).copied().unwrap_or(0);
        let y = parts_b.get(i).copied().unwrap_or(0);
        match x.cmp(&y) {
            Ordering::Equal => continue,
            other => return other,
        }
    }
    Ordering::Equal
}

#[derive(Debug, Clone, Default)]
pub struct VersionPolicy {
    pub min_version: Option<String>,
    pub latest_version: Option<String>,
}

/// Pure decision: given the app's reported version and the configured
/// policy, is it up to date, has an optional update, or must it update to
/// keep working? An unparseable client version or policy value never
/// blocks the app.
pub fn evaluate_status(version: &str, policy: &VersionPolicy) -> VersionStatus {
    if !is_valid_version(version) {
        return VersionStatus::UpToDate;
    }

    let min_version = policy
        .min_version
        .as_deref()
        .filter(|v| is_valid_version(v));
    let latest_version = policy
        .latest_version
        .as_deref()
        .filter(|v| is_valid_version(v));

    if let Some(min) = min_version {
        if compare_versions(version, min) == Ordering::Less {
            return VersionStatus::UpdateRequired;
        }
    }
    if let Some(latest) = latest_version {
        if compare_versions(version, latest) == Ordering::Less {
            return VersionStatus::UpdateAvailable;
        }
    }
    VersionStatus::UpToDate
}

/// The highest (by dotted-version order, not string order) version among
/// `versions`, or `None` if empty.
pub fn max_version<'a>(versions: impl Iterator<Item = &'a str>) -> Option<String> {
    versions
        .fold(None, |max: Option<&str>, version| match max {
            None => Some(version),
            Some(current_max) if compare_versions(version, current_max) == Ordering::Greater => {
                Some(version)
            }
            Some(current_max) => Some(current_max),
        })
        .map(String::from)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_version_pattern() {
        assert!(is_valid_version("1"));
        assert!(is_valid_version("1.9"));
        assert!(is_valid_version("1.10.2"));
        assert!(!is_valid_version(""));
        assert!(!is_valid_version("1.2.3.4"));
        assert!(!is_valid_version("1.2.x"));
        assert!(!is_valid_version("v1.2.3"));
    }

    #[test]
    fn compares_unequal_segment_counts() {
        assert_eq!(compare_versions("1.9", "1.10.2"), Ordering::Less);
        assert_eq!(compare_versions("2", "1.9.9"), Ordering::Greater);
        assert_eq!(compare_versions("1.2", "1.2.0"), Ordering::Equal);
    }

    #[test]
    fn evaluates_status() {
        let policy = VersionPolicy {
            min_version: Some("1.5.0".into()),
            latest_version: Some("1.7.0".into()),
        };
        assert_eq!(
            evaluate_status("1.4.0", &policy),
            VersionStatus::UpdateRequired
        );
        assert_eq!(
            evaluate_status("1.6.0", &policy),
            VersionStatus::UpdateAvailable
        );
        assert_eq!(evaluate_status("1.7.0", &policy), VersionStatus::UpToDate);
        assert_eq!(
            evaluate_status("not-a-version", &policy),
            VersionStatus::UpToDate
        );
    }

    #[test]
    fn never_blocks_on_unparseable_policy_values() {
        let policy = VersionPolicy {
            min_version: Some("not-a-version".into()),
            latest_version: None,
        };
        assert_eq!(evaluate_status("1.0.0", &policy), VersionStatus::UpToDate);
    }
}
