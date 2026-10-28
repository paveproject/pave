import { useEffect } from 'react';
import { decodeMeshEnvelope, decodeMeshPacket, relayBytes } from '../../lib/mesh/packet';
import { decideRelay, markSeen, rebroadcastJitterMs } from '../../lib/mesh/relay';
import { subscribeOutgoingBridge } from '../../lib/mesh/outgoingBridge';
import { meshTransport } from '../../lib/mesh/transport';
import { useMeshDebugStore } from '../../lib/mesh/debugStore';
import { receiveMeshReport } from '../../lib/watermelon/reports';
import { useSyncTaskReporter } from '../../providers/sync/useSyncTaskReporter';
import { SYNC_TASK_IDS } from '../../providers/sync/types';
import { logger } from '../../logger';

/**
 * The BLE mesh relay task (see `lib/mesh`) - always runs regardless of
 * this device's own connectivity, since a device *with* internet must
 * keep relaying for nearby devices that don't have it, or the mesh
 * provides no value (confirmed product decision, see the feature's own
 * plan). `enabled` is driven by the Settings toggle
 * (`useMeshSettingsStore`) - called unconditionally here and gated
 * internally, never called conditionally at the call site, since
 * `SyncProvider` doesn't remount when the setting flips (that would
 * violate React's rules of hooks).
 */
export const useMeshRelay = ({ enabled }: { enabled: boolean }): void => {
  const reporter = useSyncTaskReporter({ id: SYNC_TASK_IDS.meshRelay, enabled });

  useEffect(() => {
    if (!enabled) return;
    reporter.reportStart();

    const unsubscribeReceive = meshTransport.onReceive((bytes) => {
      // Envelope first: dedup and relay only need version/ttl/reportId, so a
      // report type this build doesn't know yet still gets forwarded instead
      // of dying here.
      const envelope = decodeMeshEnvelope(bytes);
      if (!envelope) return;

      const { shouldProcessLocally, shouldRebroadcast } = decideRelay(envelope);
      if (!shouldProcessLocally) return;
      markSeen(envelope.reportId);

      const packet = decodeMeshPacket(bytes);
      if (packet) {
        receiveMeshReport(packet)
          .then(() => useMeshDebugStore.getState().recordReceived())
          .catch((error) => logger.error('mesh: failed to ingest received report', { error }));
      } else {
        logger.info('mesh: relaying a report type this build has no wire code for');
      }

      if (shouldRebroadcast) {
        setTimeout(() => {
          meshTransport
            .send(relayBytes(bytes))
            .then(() => useMeshDebugStore.getState().recordRelayed())
            .catch((error) => logger.error('mesh: failed to rebroadcast packet', { error }));
        }, rebroadcastJitterMs());
      }
    });

    const unsubscribePeerCount = meshTransport.onPeerCountChange((count) =>
      useMeshDebugStore.getState().setPeerCount(count),
    );
    const unsubscribeOutgoing = subscribeOutgoingBridge();

    meshTransport
      .start()
      .then(() => reporter.reportSuccess())
      .catch((error) => reporter.reportError(error));

    return () => {
      unsubscribeReceive();
      unsubscribePeerCount();
      unsubscribeOutgoing();
      useMeshDebugStore.getState().setPeerCount(0);
      meshTransport
        .stop()
        .catch((error) => logger.error('mesh: failed to stop cleanly', { error }));
    };
  }, [enabled, reporter]);
};
