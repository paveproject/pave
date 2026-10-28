use super::dto::ReportsResponse;
use sea_orm::prelude::DateTimeWithTimeZone;
use sea_orm::FromQueryResult;
use std::collections::HashMap;

/// Max real-world distance (meters) between two reports of the SAME type
/// before they're folded into one marker with a `count`. Deliberately
/// tight: GPS jitter during a protest (open sky ~5-15m, degraded
/// urban-canyon ~15-30m) overlaps with how close two genuinely distinct
/// streets can sit in a dense city center (as little as ~15-25m) - no
/// radius perfectly satisfies both "always merge true duplicates" and
/// "never merge two different streets". This picks the tight side on
/// purpose, per explicit product requirement: better to occasionally show
/// two pins for the same event than to ever merge two distinct ones.
/// Provisional - revisit after real field testing during an actual protest.
pub const GROUP_RADIUS_METERS: f64 = 20.0;

#[derive(Debug, FromQueryResult)]
pub struct ReportRow {
    pub id: String,
    pub r#type: String,
    pub lng: f64,
    pub lat: f64,
    pub occurred_at: DateTimeWithTimeZone,
    pub expires_at: DateTimeWithTimeZone,
}

const EARTH_RADIUS_M: f64 = 6_371_000.0;

fn haversine_distance_m(a_lat: f64, a_lng: f64, b_lat: f64, b_lng: f64) -> f64 {
    let (a_lat_rad, b_lat_rad) = (a_lat.to_radians(), b_lat.to_radians());
    let d_lat = b_lat_rad - a_lat_rad;
    let d_lng = (b_lng - a_lng).to_radians();

    let sin_lat = (d_lat / 2.0).sin();
    let sin_lng = (d_lng / 2.0).sin();
    let h = sin_lat * sin_lat + a_lat_rad.cos() * b_lat_rad.cos() * sin_lng * sin_lng;

    2.0 * EARTH_RADIUS_M * h.sqrt().asin()
}

fn find(parent: &mut [usize], x: usize) -> usize {
    if parent[x] != x {
        parent[x] = find(parent, parent[x]);
    }
    parent[x]
}

fn union(parent: &mut [usize], a: usize, b: usize) {
    let (root_a, root_b) = (find(parent, a), find(parent, b));
    if root_a != root_b {
        parent[root_a] = root_b;
    }
}

/// Collapses same-type reports within `radius_m` of each other (true
/// geodesic distance, not degree- or Mercator-based) into one
/// `ReportsResponse` with a `count`. Single-linkage clustering via
/// union-find: two rows are only ever compared/unioned when their `type`
/// also matches, so distinct types never interact. Linkage is transitive -
/// a chain of reports each within `radius_m` of the next can end up in one
/// group even if the two ends are farther apart than `radius_m`.
pub fn group_reports(rows: Vec<ReportRow>, radius_m: f64) -> Vec<ReportsResponse> {
    let n = rows.len();
    let mut parent: Vec<usize> = (0..n).collect();

    for i in 0..n {
        for j in (i + 1)..n {
            if rows[i].r#type == rows[j].r#type
                && haversine_distance_m(rows[i].lat, rows[i].lng, rows[j].lat, rows[j].lng)
                    <= radius_m
            {
                union(&mut parent, i, j);
            }
        }
    }

    let mut groups: HashMap<usize, Vec<usize>> = HashMap::new();
    for i in 0..n {
        let root = find(&mut parent, i);
        groups.entry(root).or_default().push(i);
    }

    groups
        .into_values()
        .map(|idxs| build_group_response(&rows, &idxs))
        .collect()
}

fn build_group_response(rows: &[ReportRow], idxs: &[usize]) -> ReportsResponse {
    let centroid_lat = idxs.iter().map(|&i| rows[i].lat).sum::<f64>() / idxs.len() as f64;
    let centroid_lng = idxs.iter().map(|&i| rows[i].lng).sum::<f64>() / idxs.len() as f64;
    let rep = idxs
        .iter()
        .map(|&i| &rows[i])
        .max_by_key(|r| r.occurred_at)
        .expect("group is never empty");

    ReportsResponse {
        id: rep.id.clone(),
        r#type: rep.r#type.clone(),
        lat: centroid_lat,
        lng: centroid_lng,
        occurred_at: rep.occurred_at.to_rfc3339(),
        expires_at: rep.expires_at.to_rfc3339(),
        count: idxs.len() as u32,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{DateTime, Utc};

    fn row(id: &str, r#type: String, lat: f64, lng: f64, occurred_at_secs: i64) -> ReportRow {
        let occurred_at: DateTimeWithTimeZone =
            DateTime::<Utc>::from_timestamp(occurred_at_secs, 0)
                .unwrap()
                .into();
        ReportRow {
            id: id.to_string(),
            r#type,
            lng,
            lat,
            occurred_at,
            expires_at: occurred_at,
        }
    }

    #[test]
    fn merges_gps_jitter_of_the_same_event() {
        // ~8m apart at Paris latitude - well within typical open-sky GPS noise.
        let rows = vec![
            row("a", "tear_gas".to_string(), 48.8566, 2.3522, 100),
            row("b", "tear_gas".to_string(), 48.85665, 2.35225, 200),
        ];
        let grouped = group_reports(rows, GROUP_RADIUS_METERS);
        assert_eq!(grouped.len(), 1);
        assert_eq!(grouped[0].count, 2);
        assert_eq!(grouped[0].id, "b"); // most recent occurred_at
    }

    #[test]
    fn keeps_two_distinct_streets_separate() {
        // ~28m apart at Paris latitude - beyond the 20m radius, like two
        // parallel streets.
        let rows = vec![
            row("a", "tear_gas".to_string(), 48.8566, 2.3522, 100),
            row("b", "tear_gas".to_string(), 48.85685, 2.3522, 200),
        ];
        let grouped = group_reports(rows, GROUP_RADIUS_METERS);
        assert_eq!(grouped.len(), 2);
        assert!(grouped.iter().all(|r| r.count == 1));
    }

    #[test]
    fn never_merges_across_types() {
        let rows = vec![
            row("a", "tear_gas".to_string(), 48.8566, 2.3522, 100),
            row("b", "violence".to_string(), 48.8566, 2.3522, 200),
        ];
        let grouped = group_reports(rows, GROUP_RADIUS_METERS);
        assert_eq!(grouped.len(), 2);
    }
}
