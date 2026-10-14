import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { listReports, type ReportResponse } from '@libs/api-js';
import { reportsKeys } from './reportsKeys';

export interface ReportsBoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

const reportsOptions = (bbox: ReportsBoundingBox) => {
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

/** Non-expired reports within the map's current viewport. */
export const useReportsQuery = (bbox: ReportsBoundingBox | undefined) => {
  return useQuery({
    ...reportsOptions(bbox ?? { minLat: 0, minLng: 0, maxLat: 0, maxLng: 0 }),
    enabled: !!bbox,
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
  report: ReportResponse,
) => {
  queryClient.setQueryData(reportsOptions(bbox).queryKey, (current) => {
    if (!current) return current;
    if (current.some((existing) => existing.id === report.id)) return current;
    return [report, ...current];
  });
};
