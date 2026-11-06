import { useEffect } from 'react';
import {
  getUnsyncedProtestCount,
  observeUnsyncedPositionCount,
  reconcileUnsyncedProtestData,
} from '../../lib/watermelon/protestSessions';
import { useSyncTaskReporter } from '../../providers/sync/useSyncTaskReporter';
import { SYNC_TASK_IDS } from '../../providers/sync/types';
import { useAuth } from '../../providers/AuthProvider';

/**
 * Startup catch-up for protest-mode data, mirroring `useReportSync`.
 *
 * Reconnect retry is `protestExecutor`'s job, not this hook's - it keeps its
 * own durable queue and replays on reconnect and app-foreground. This only
 * re-queues what the app may have written locally without ever reaching the
 * outbox (killed between the two), and reports it into the same registry as
 * every other sync task.
 *
 * Gated on a signed-in user, unlike `useReportSync`: every push here needs
 * the account's DEK to seal with.
 */
export const useProtestSync = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const reporter = useSyncTaskReporter({ id: SYNC_TASK_IDS.protest, enabled: !!userId });

  // Reported continuously, not just at startup: positions pile up for a whole
  // session between flushes, so a count taken once goes stale within seconds -
  // and it is what warns the user before a logout destroys them.
  useEffect(() => {
    if (!userId) return;
    const subscription = observeUnsyncedPositionCount().subscribe((count) => {
      reporter.reportPendingCount(count);
    });
    return () => subscription.unsubscribe();
  }, [reporter, userId]);

  useEffect(() => {
    if (!userId) return;
    reporter.reportStart();
    getUnsyncedProtestCount().then((count) => reporter.reportPendingCount(count));
    reconcileUnsyncedProtestData(userId)
      .then(() => reporter.reportSuccess())
      .catch((error) => reporter.reportError(error))
      .finally(() => getUnsyncedProtestCount().then((count) => reporter.reportPendingCount(count)));
  }, [reporter, userId]);
};
