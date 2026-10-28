import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { listReports, type ReportsResponse } from '@libs/api-js';
import { reportsKeys } from './reportsKeys';

export interface ReportsBoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** Non-expired reports within the map's current viewport. */
export const reportsOptions = (bbox: ReportsBoundingBox) => {
  return queryOptions({
    queryKey: reportsKeys.list(bbox),
    queryFn: async () => {
      const { data, error } = await listReports({ query: bbox });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
};

/**
 * Merges a `ReportCreated` websocket event into the cache for the bbox it
 * arrived for, without a refetch - a no-op if that bbox isn't cached (e.g.
 * the map isn't currently showing it) or the report is already there (the
 * same connection can receive a report it just created itself, or a
 * duplicate from a retried offline-first push).
 */
export const applyReportCreated = (
  queryClient: QueryClient,
  bbox: ReportsBoundingBox,
  report: ReportsResponse,
) => {
  queryClient.setQueryData(reportsOptions(bbox).queryKey, (current) => {
    if (!current) return current;
    if (current.some((existing) => existing.id === report.id)) return current;
    return [report, ...current];
  });
};
