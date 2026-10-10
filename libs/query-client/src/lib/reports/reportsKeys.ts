export const reportsKeys = {
  base: 'reports' as const,

  list: (bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number }) =>
    [reportsKeys.base, bbox] as const,
};
