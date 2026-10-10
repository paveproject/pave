import type { ReportType } from '@libs/api-js';

const reportPlaceholder = 'map_reports_placeholder';

/**
 * Cluster severity tiers - how "bad" a cluster looks scales with how many
 * reports it bundles, not just a plain count label. Flat-color stand-ins
 * for now (see `src/assets/images/map/reports/`); swap each file for real
 * artwork (smoke, crowds, collapsing buildings, ...) later without
 * touching `screens/map/MapMap.tsx` - it only reads these names.
 */
export type ClusterSeverity = 'low' | 'medium' | 'high' | 'extreme';

export const Assets = {
  reports: {
    tear_gas: reportPlaceholder,
    police_presence: reportPlaceholder,
    arrest: reportPlaceholder,
    violence: reportPlaceholder,
    road_block: reportPlaceholder,
    medical: reportPlaceholder,
    water_cannon: reportPlaceholder,
    kettling: reportPlaceholder,
    other: reportPlaceholder,
  } satisfies Record<ReportType, string>,
  clusterSeverity: {
    low: 'map_reports_cluster_low',
    medium: 'map_reports_cluster_medium',
    high: 'map_reports_cluster_high',
    extreme: 'map_reports_cluster_extreme',
  } satisfies Record<ClusterSeverity, string>,
};
