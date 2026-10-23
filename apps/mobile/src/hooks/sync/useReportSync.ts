import { useEffect } from 'react';
import { getUnsyncedReportsCount, reconcileUnsyncedReports } from '../../lib/watermelon/reports';
import { useSyncTaskReporter } from '../../providers/sync/useSyncTaskReporter';
import { SYNC_TASK_IDS } from '../../providers/sync/types';

/**
 * Reconnect retry for reports is no longer handled here - it's
 * `reportsExecutor`'s job now (see
 * `providers/sync/offlineExecutor/reportsExecutor.ts`), which persists
 * its own queue and retries on reconnect/app-foreground on its own. This
 * just runs the one-time startup catch-up once, and reports it into the
 * same registry as every other sync task.
 */
export const useReportSync = () => {
  const reporter = useSyncTaskReporter({ id: SYNC_TASK_IDS.reports });

  useEffect(() => {
    reporter.reportStart();
    getUnsyncedReportsCount().then((count) => reporter.reportPendingCount(count));
    reconcileUnsyncedReports()
      .then(() => reporter.reportSuccess())
      .catch((error) => reporter.reportError(error))
      .finally(() => getUnsyncedReportsCount().then((count) => reporter.reportPendingCount(count)));
  }, [reporter]);
};
