import {
  REPORT_TYPES,
  cellSizeDegrees,
  groupsByFamily,
  snapToGrid,
  type ReportTypeKey,
} from '@libs/constants';

/**
 * Collapses nearby reports into one entry with a `count`, for the local and
 * mesh-relayed rows that haven't synced yet (confirmed server rows arrive
 * already grouped - see `reportsOptions`).
 *
 * Deliberately the same rule the API applies, from the same constants in
 * @libs/constants: both sets are drawn on one map, so a different rule here
 * showed coarse server clusters next to a scatter of individual local pins at
 * the same zoom. It replaced a fixed 20m radius with pairwise union-find,
 * which neither tracked the viewport nor scaled - it was O(n²), the same
 * reason it was taken out of the API.
 */

export interface GroupableReport {
  id: string;
  type: ReportTypeKey;
  lat: number;
  lng: number;
  occurredAt: Date;
}

export interface GroupedReport {
  id: string;
  /** A type key, or a family key when `kind` is `family`. */
  type: string;
  kind: 'type' | 'family';
  lat: number;
  lng: number;
  occurredAt: Date;
  count: number;
}

export interface GroupingViewport {
  minLng: number;
  maxLng: number;
}

export function groupReports(
  reports: GroupableReport[],
  viewport: GroupingViewport,
): GroupedReport[] {
  const cell = cellSizeDegrees(viewport.minLng, viewport.maxLng);
  const byFamily = groupsByFamily(cell);

  const cells = new Map<
    string,
    { members: GroupableReport[]; types: Set<string>; bucket: string }
  >();

  for (const report of reports) {
    const family = REPORT_TYPES[report.type]?.family;
    // A type this build doesn't know (relayed from a newer peer) has no family
    // to bucket under, so it stands on its own rather than being dropped.
    const bucket = byFamily && family ? family : report.type;
    const key = `${bucket}@${snapToGrid(report.lng, cell)},${snapToGrid(report.lat, cell)}`;

    const existing = cells.get(key);
    if (existing) {
      existing.members.push(report);
      existing.types.add(report.type);
    } else {
      cells.set(key, { members: [report], types: new Set([report.type]), bucket });
    }
  }

  return [...cells.values()].map(({ members, types, bucket }) => {
    // Same fallback as the API: "Aid, 1" tells a reader less than "Medical, 1",
    // and only a real mix inside a family has anything to summarise.
    const single = types.size === 1;
    const newest = members.reduce((a, b) => (b.occurredAt > a.occurredAt ? b : a));

    return {
      // The newest member's own id when it stands alone, so a later server
      // row for the same report dedups against it.
      id: members.length === 1 ? members[0].id : `${bucket}@${newest.lng},${newest.lat}`,
      type: single ? newest.type : bucket,
      kind: single ? ('type' as const) : ('family' as const),
      lat: members.reduce((sum, r) => sum + r.lat, 0) / members.length,
      lng: members.reduce((sum, r) => sum + r.lng, 0) / members.length,
      occurredAt: newest.occurredAt,
      count: members.length,
    };
  });
}
