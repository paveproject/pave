import { observeUnsyncedReports } from '../watermelon/reports';
import { encodeMeshPacket, MESH_INITIAL_TTL } from './packet';
import { meshTransport } from './transport';
import { useMeshDebugStore } from './debugStore';
import { useSyncLogStore } from '../../providers/sync/syncLogStore';
import { SYNC_TASK_IDS } from '../../providers/sync/types';
import { logger } from '../../logger';

/**
 * The outgoing half of the mesh bridge - watches for new local reports
 * and broadcasts them, without `lib/watermelon/reports.ts`/`createReport`
 * needing to know the mesh relay exists at all (no coupling in that
 * direction). `observeUnsyncedReports()` already fires for every newly
 * `createReport`'d row, since that's exactly the query it's built on.
 *
 * Tracks already-broadcast ids in a plain in-memory `Set`, not a
 * persisted column - losing it on relaunch just means re-broadcasting a
 * report once more, which is harmless (the receiving end's own dedup in
 * `relay.ts`, and the server's `ON CONFLICT (id) DO NOTHING`, both
 * already tolerate redundant re-sends by design).
 */
export const subscribeOutgoingBridge = (): (() => void) => {
  const broadcastReportIds = new Set<string>();

  const subscription = observeUnsyncedReports().subscribe((unsyncedReports) => {
    const newReports = unsyncedReports.filter((report) => !broadcastReportIds.has(report.id));
    if (newReports.length === 0) return;

    newReports.forEach((report) => {
      broadcastReportIds.add(report.id);
      const packet = encodeMeshPacket({
        version: 1,
        type: report.type,
        ttl: MESH_INITIAL_TTL,
        reportId: report.id,
        lat: report.lat,
        lng: report.lng,
        occurredAt: report.occurredAt,
      });
      useSyncLogStore.getState().append({
        taskId: SYNC_TASK_IDS.meshRelay,
        status: 'syncing',
        message: `report ${report.id.slice(0, 8)}…: broadcasting over BLE`,
      });
      meshTransport
        .send(packet)
        .then(() => {
          useMeshDebugStore.getState().recordSent();
          useSyncLogStore.getState().append({
            taskId: SYNC_TASK_IDS.meshRelay,
            status: 'idle',
            message: `report ${report.id.slice(0, 8)}…: broadcast sent`,
          });
        })
        .catch((error) => {
          logger.error('mesh: failed to broadcast local report', { error });
          useSyncLogStore.getState().append({
            taskId: SYNC_TASK_IDS.meshRelay,
            status: 'error',
            message: `report ${report.id.slice(0, 8)}…: broadcast failed`,
          });
        });
    });
  });

  return () => subscription.unsubscribe();
};
