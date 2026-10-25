/**
 * Collapses same-type, nearby reports into one entry with a `count` -
 * client-side port of `apps/api/src/app/reports/grouping.rs`'s
 * `group_reports`/`haversine_distance_m`, used only for not-yet-synced
 * local/mesh reports (confirmed server rows are already grouped
 * server-side, see `useReportsQuery`/`ReportsResponse.count`).
 */

/** Mirrors `apps/api/src/app/reports/grouping.rs`'s `GROUP_RADIUS_METERS` -
 * keep both in sync if the radius ever changes. */
export const GROUP_RADIUS_METERS = 20;

const EARTH_RADIUS_M = 6_371_000;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

function haversineDistanceM(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const dLat = toRadians(bLat - aLat);
  const dLng = toRadians(bLng - aLng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat + Math.cos(toRadians(aLat)) * Math.cos(toRadians(bLat)) * sinLng * sinLng;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

export interface GroupableReport {
  id: string;
  type: string;
  lat: number;
  lng: number;
  occurredAt: Date;
}

export interface GroupedReport {
  id: string;
  type: string;
  lat: number;
  lng: number;
  occurredAt: Date;
  count: number;
}

function find(parent: number[], x: number): number {
  if (parent[x] !== x) {
    parent[x] = find(parent, parent[x]);
  }
  return parent[x];
}

function union(parent: number[], a: number, b: number): void {
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA !== rootB) {
    parent[rootA] = rootB;
  }
}

/**
 * Single-linkage clustering via union-find: two reports are only ever
 * compared/unioned when their `type` also matches, so distinct types
 * never interact. Linkage is transitive - a chain of reports each within
 * `radiusM` of the next can end up in one group even if the two ends are
 * farther apart than `radiusM` (same tradeoff as the server-side version).
 */
export function groupReports<T extends GroupableReport>(
  reports: T[],
  radiusM: number,
): GroupedReport[] {
  const n = reports.length;
  const parent = Array.from({ length: n }, (_, i) => i);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (
        reports[i].type === reports[j].type &&
        haversineDistanceM(reports[i].lat, reports[i].lng, reports[j].lat, reports[j].lng) <=
          radiusM
      ) {
        union(parent, i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(parent, i);
    const existing = groups.get(root);
    if (existing) existing.push(i);
    else groups.set(root, [i]);
  }

  return Array.from(groups.values()).map((indices) => buildGroup(reports, indices));
}

function buildGroup<T extends GroupableReport>(reports: T[], indices: number[]): GroupedReport {
  const centroidLat = indices.reduce((sum, i) => sum + reports[i].lat, 0) / indices.length;
  const centroidLng = indices.reduce((sum, i) => sum + reports[i].lng, 0) / indices.length;
  const representativeIndex = indices.reduce((bestIndex, i) =>
    reports[i].occurredAt > reports[bestIndex].occurredAt ? i : bestIndex,
  );
  const representative = reports[representativeIndex];

  return {
    id: representative.id,
    type: representative.type,
    lat: centroidLat,
    lng: centroidLng,
    occurredAt: representative.occurredAt,
    count: indices.length,
  };
}
