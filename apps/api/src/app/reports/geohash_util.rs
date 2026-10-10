use super::dto::ListReportsQuery;
use geohash::{encode, neighbors, Coord};
use std::collections::HashSet;

/// ~4.9km x 4.9km cells at the equator. A named constant so it's easy to
/// tune later without hunting through the fan-out logic - smaller cells
/// mean more precise viewport matching but more Redis channels to manage
/// per connection; larger cells mean fewer channels but more
/// irrelevant-to-the-viewport fan-out.
pub const GEOHASH_PRECISION: usize = 5;

/// The set of cells covering a viewport. A viewport usually spans several
/// cells, so this grid-steps across the bbox rather than encoding a single
/// point.
pub fn cells_for_bbox(query: &ListReportsQuery) -> HashSet<String> {
    let mut cells = HashSet::new();

    // One cell's lat/lng span at our precision, taken from an arbitrary
    // corner of the bbox, used as the grid step size.
    let Ok(corner) = encode(
        Coord {
            x: query.min_lng,
            y: query.min_lat,
        },
        GEOHASH_PRECISION,
    ) else {
        return cells;
    };
    let Ok(corner_bbox) = geohash::decode_bbox(&corner) else {
        return cells;
    };
    let lat_step = (corner_bbox.max().y - corner_bbox.min().y).max(1e-6);
    let lng_step = (corner_bbox.max().x - corner_bbox.min().x).max(1e-6);

    let mut lat = query.min_lat;
    while lat <= query.max_lat {
        let mut lng = query.min_lng;
        while lng <= query.max_lng {
            if let Ok(cell) = encode(Coord { x: lng, y: lat }, GEOHASH_PRECISION) {
                cells.insert(cell);
            }
            lng += lng_step;
        }
        lat += lat_step;
    }

    cells
}

/// The cells a single point's report should be published to: its own cell
/// plus the 8 neighbors, so a report near a cell edge still reaches a
/// client whose viewport technically falls just the other side of that
/// edge (their cell set only gets recomputed on their next pan/zoom).
/// Simplest safe default for v1 - revisit if fan-out volume ever becomes a
/// problem.
pub fn cells_for_point(lat: f64, lng: f64) -> HashSet<String> {
    let mut cells = HashSet::new();
    let Ok(cell) = encode(Coord { x: lng, y: lat }, GEOHASH_PRECISION) else {
        return cells;
    };
    if let Ok(n) = neighbors(&cell) {
        cells.extend([n.sw, n.s, n.se, n.w, n.e, n.nw, n.n, n.ne]);
    }
    cells.insert(cell);
    cells
}
