import { useQuery } from '@tanstack/react-query';
import { listReports } from '@libs/api-js';
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
