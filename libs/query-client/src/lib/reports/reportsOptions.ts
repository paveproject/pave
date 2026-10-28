import { keepPreviousData, queryOptions, type QueryClient } from '@tanstack/react-query';
import { listReports, type ReportsResponse } from '@libs/api-js';
import { reportsKeys } from './reportsKeys';

export interface ReportsBoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/**
 * Non-expired reports within the map's current viewport, already clustered
 * server-side for that viewport's span.
 *
 * `keepPreviousData` because the bbox is part of the key: panning mints a new
 * key, whose data starts `undefined`, and the map read that as "no markers" -
 * so every pan blanked the map until the fetch landed. The previous
 * viewport's markers now stay on screen until the new ones arrive. They are
 * briefly the wrong viewport's markers, which is the trade: stale pins beat no
 * pins on a map someone is navigating with. `isPlaceholderData` says when that
 * is the case, if it ever needs showing.
 */
export const reportsOptions = (bbox: ReportsBoundingBox) => {
  return queryOptions({
    queryKey: reportsKeys.list(bbox),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error } = await listReports({ query: bbox });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
};

/**
 * Merges a batch of `ReportCreated` websocket events into the cache for the
 * bbox they arrived for - a no-op if that bbox isn't cached (the map isn't
 * showing it) and skipping any report already there, since the same
 * connection can receive one it just created, or a duplicate from a retried
 * offline-first push.
 *
 * Takes a batch, not one report, because the single-report version rebuilt the
 * whole array per event: `[report, ...current]` is O(n), and under load that
 * ran 335 times a second against an array growing past 100k, which allocated
 * faster than the device could collect and took the app down. One array per
 * flush instead of one per event.
 */
export const applyReportsCreated = (
  queryClient: QueryClient,
  bbox: ReportsBoundingBox,
  reports: ReportsResponse[],
) => {
  if (reports.length === 0) return;

  queryClient.setQueryData(reportsOptions(bbox).queryKey, (current) => {
    if (!current) return current;

    const known = new Set(current.map((report) => report.id));
    const fresh = reports.filter((report) => {
      if (known.has(report.id)) return false;
      known.add(report.id);
      return true;
    });

    return fresh.length === 0 ? current : [...fresh, ...current];
  });
};
