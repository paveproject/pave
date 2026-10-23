import { useEffect, useRef } from 'react';
import { acquireNetworkStatusListener, useNetworkStatusStore } from './networkStatus';
import { useSyncTaskReporter } from './useSyncTaskReporter';
import { logger } from '../../logger';

interface UseSyncTaskOptions {
  /** Stable, unique id - see `SYNC_TASK_IDS`. */
  id: string;
  /** Gate the whole task (e.g. `!!user`) - skips registering entirely while false. */
  enabled?: boolean;
  /** Reported to the registry before and after each run; omit if counting is expensive/irrelevant. */
  getPendingCount?: () => Promise<number> | number;
  run: () => Promise<void>;
}

/**
 * The "retry on reconnect" flavor of a sync task (see `useSyncTaskReporter`
 * for the lower-level registry primitive) - for anything with a local
 * queue that just needs pushing as soon as we're back online. Replaces
 * the copy-pasted `NetInfo.addEventListener` + `wasOffline` ref that used
 * to live separately in `useReportSync`/`useMeSync`.
 *
 * Tasks run fully independently of each other - each call to this hook has
 * its own in-flight guard, so N tasks reconnecting at once run in parallel,
 * never serialized through a shared queue. The underlying `NetInfo`
 * listener itself IS shared (see `networkStatus.ts`) - that's just to
 * avoid N native listeners, it doesn't couple the tasks' execution.
 */
export const useSyncTask = ({
  id,
  enabled = true,
  getPendingCount,
  run,
}: UseSyncTaskOptions): void => {
  const reporter = useSyncTaskReporter({ id, enabled });
  const isRunningRef = useRef(false);
  const runRef = useRef(run);
  const getPendingCountRef = useRef(getPendingCount);

  useEffect(() => {
    runRef.current = run;
    getPendingCountRef.current = getPendingCount;
  }, [run, getPendingCount]);

  useEffect(() => {
    if (!enabled) return;

    const refreshPendingCount = async () => {
      const count = await getPendingCountRef.current?.();
      if (count !== undefined) reporter.reportPendingCount(count);
    };

    const attemptSync = async () => {
      if (isRunningRef.current) return;
      isRunningRef.current = true;
      reporter.reportStart();
      try {
        await runRef.current();
        reporter.reportSuccess();
      } catch (error) {
        logger.error(`sync task "${id}" failed`, { error });
        reporter.reportError(error);
      } finally {
        isRunningRef.current = false;
        await refreshPendingCount();
      }
    };

    refreshPendingCount();
    if (useNetworkStatusStore.getState().isOnline) {
      attemptSync();
    }

    const releaseListener = acquireNetworkStatusListener();
    const unsubscribe = useNetworkStatusStore.subscribe((state, prevState) => {
      if (state.isOnline && !prevState.isOnline) {
        attemptSync();
      }
    });

    return () => {
      unsubscribe();
      releaseListener();
    };
  }, [enabled, id, reporter]);
};
