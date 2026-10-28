use sea_orm::prelude::DateTimeWithTimeZone;
use sea_orm::FromQueryResult;

/// Mirrors `CELLS_ACROSS_VIEWPORT` in @libs/constants, which is the source of
/// record - the mobile app applies the same rule to local and mesh-relayed
/// reports, and the two sets are drawn on one map. Rust can't import it.
///
/// How many grid cells the viewport is cut into across its width. Four: at six
/// a march-sized crowd still came back as ~36 markers inside a 400m view,
/// where the same points collapse to ~22 at four. Lower than this and the grid
/// starts reading as a pattern - markers snap to three columns on screen, and
/// a dense cluster sitting on a boundary visibly splits in two.
const CELLS_ACROSS_VIEWPORT: f64 = 4.0;

/// Floor on the cell, so a degenerate or absurdly tight bbox can't ask for a
/// grid finer than GPS precision. ~1m.
const MIN_CELL_DEGREES: f64 = 0.00001;

/// Above this cell size, markers group by family instead of by type. Six
/// families instead of twenty-nine types is the difference between ~330 and
/// ~110 markers for a city-wide view, and it is what the family level of the
/// taxonomy exists for. Below it the viewport is tight enough that the precise
/// type is what a reader needs.
///
/// Mirrors `FAMILY_GROUPING_MIN_CELL_DEGREES` in @libs/constants.
///
/// Tracks `CELLS_ACROSS_VIEWPORT`: the handover happens at
/// `FAMILY_GROUPING_MIN_CELL * CELLS_ACROSS_VIEWPORT` degrees of viewport,
/// so changing the grid density without this would silently move it. Both
/// together keep it at about 480m across - that is the number to move if the
/// handover feels early or late.
const FAMILY_GROUPING_MIN_CELL: f64 = 0.0031;

/// Hard ceiling on markers per viewport. Never reached in practice once the
/// grid does its work (~1k at the worst zoom over 100k reports in Paris), so
/// it is a backstop against a pathological viewport, not a tuning knob.
pub const MAX_MARKERS: u32 = 2000;

/// Grid cell size in degrees, taken from the viewport the client already
/// sends. No `zoom` parameter: the bbox span *is* the zoom, and it is the more
/// honest input - a tablet and a phone at the same zoom see very different
/// areas, and only the span knows that. It also means no client change, and
/// nothing to default when an older build calls.
///
/// The cell shrinks as the viewport does, which is what makes clusters
/// dissolve into individual pins at street level with no special case for it.
pub fn cell_size_degrees(min_lng: f64, max_lng: f64) -> f64 {
    let span = (max_lng - min_lng).abs();
    (span / CELLS_ACROSS_VIEWPORT).max(MIN_CELL_DEGREES)
}

/// Whether a marker speaks for a family or for a single report type. The
/// client needs it to pick the icon, and because `other` is both a family key
/// and a type key, the key alone cannot say.
pub fn groups_by_family(cell: f64) -> bool {
    cell > FAMILY_GROUPING_MIN_CELL
}

/// One grid cell, already aggregated by Postgres.
///
/// The pairwise union-find this module used to run is gone: it was O(n²) with
/// a haversine per pair, so a Paris-wide viewport over 100k reports meant
/// ~3.6e9 distance computations in the request. The database groups instead,
/// and returns ~1k rows whatever the zoom.
#[derive(Debug, FromQueryResult)]
pub struct ReportCluster {
    /// The report's own id when the cell holds exactly one, so a live
    /// websocket event still dedups against it; a deterministic cell key
    /// otherwise, so a cluster keeps its identity across refetches.
    pub id: String,
    /// A `report_type.key`, or a `report_family.key` when `kind` is `family`.
    pub r#type: String,
    /// `"family"` or `"type"`.
    pub kind: String,
    pub lng: f64,
    pub lat: f64,
    pub occurred_at: DateTimeWithTimeZone,
    pub expires_at: DateTimeWithTimeZone,
    pub count: i64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cell_shrinks_with_the_viewport() {
        // Paris end to end, then one street.
        let wide = cell_size_degrees(2.24, 2.43);
        let street = cell_size_degrees(2.3516, 2.3528);

        assert!(street < wide);
        // Expressed against the constant, not a literal, so retuning the grid
        // density doesn't mean editing the test that guards it.
        assert!((wide - (2.43 - 2.24) / CELLS_ACROSS_VIEWPORT).abs() < 1e-9);
    }

    #[test]
    fn groups_by_family_only_when_zoomed_out() {
        // A city-wide viewport, then one street.
        assert!(groups_by_family(cell_size_degrees(2.24, 2.43)));
        assert!(!groups_by_family(cell_size_degrees(2.3516, 2.3528)));
    }

    /// The three constants above are hand-copied from @libs/constants because
    /// Rust cannot import TypeScript. Nothing but this test stops one side
    /// from being retuned alone, and the symptom would be coarse server
    /// clusters next to finer local ones at the same zoom - easy to misread as
    /// a rendering bug.
    #[test]
    fn mirrors_the_constants_lib() {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../libs/constants/src/lib/reports.ts"
        ))
        .expect("@libs/constants is the source of record for the grouping rule");

        for (name, value) in [
            ("CELLS_ACROSS_VIEWPORT", CELLS_ACROSS_VIEWPORT),
            ("MIN_CELL_DEGREES", MIN_CELL_DEGREES),
            ("FAMILY_GROUPING_MIN_CELL_DEGREES", FAMILY_GROUPING_MIN_CELL),
        ] {
            let decl = format!("export const {name} = ");
            let rest = src
                .split_once(&decl)
                .unwrap_or_else(|| panic!("{name} is gone from @libs/constants"))
                .1;
            let declared: f64 = rest
                .split(';')
                .next()
                .and_then(|v| v.trim().parse().ok())
                .unwrap_or_else(|| panic!("{name} is no longer a plain number literal"));

            assert!(
                (declared - value).abs() < f64::EPSILON,
                "{name} is {declared} in @libs/constants but {value} here"
            );
        }
    }

    #[test]
    fn never_grids_finer_than_gps() {
        // A zero-width bbox would otherwise ask for a cell of zero degrees.
        assert_eq!(cell_size_degrees(2.35, 2.35), MIN_CELL_DEGREES);
        assert!(
            (cell_size_degrees(2.43, 2.24) - cell_size_degrees(2.24, 2.43)).abs() < f64::EPSILON,
            "order must not matter"
        );
    }
}
