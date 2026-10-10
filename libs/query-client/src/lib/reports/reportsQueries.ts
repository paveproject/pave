import { useQuery, type QueryClient } from '@tanstack/react-query';
import { listReports, type ReportResponse } from '@libs/api-js';
import { reportsKeys } from './reportsKeys';

export interface ReportsBoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/** Non-expired reports within the map's current viewport. */
export const useReportsQuery = (bbox: ReportsBoundingBox | undefined) => {
  return useQuery({
    queryKey: reportsKeys.list(bbox ?? { minLat: 0, minLng: 0, maxLat: 0, maxLng: 0 }),
    queryFn: async () => {
      const { data, error } = await listReports({
        query: {
          minLat: bbox!.minLat,
          minLng: bbox!.minLng,
          maxLat: bbox!.maxLat,
          maxLng: bbox!.maxLng,
        },
      });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
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
  queryClient.setQueryData<ReportResponse[]>(reportsKeys.list(bbox), (current) => {
    if (!current) return current;
    if (current.some((existing) => existing.id === report.id)) return current;
    return [report, ...current];
  });
};
