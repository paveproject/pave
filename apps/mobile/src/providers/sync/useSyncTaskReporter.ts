import { useEffect, useMemo } from 'react';
import { useSyncRegistryStore } from './syncRegistryStore';
import { useSyncLogStore } from './syncLogStore';

interface UseSyncTaskReporterOptions {
  /** Stable, unique id - see `SYNC_TASK_IDS`. */
  id: string;
  /** Skips registering entirely while false (e.g. `!!user`, or "no active request to watch"). */
  enabled?: boolean;
}

export interface SyncTaskReporter {
  reportStart: () => void;
  reportSuccess: () => void;
  reportError: (error: unknown) => void;
  reportPendingCount: (count: number) => void;
}

/**
 * Registers `id` into the shared sync registry for the lifetime of the
 * mount, and returns the functions to report its status. This is the
 * low-level primitive - it has no opinion on what *triggers* a run.
 * `useSyncTask` builds the "retry on reconnect" flavor on top of it; the
 * recovery-key cluster (reactive to react-query cache changes, or polling
 * - not connectivity) reports through this directly, so every task is
 * visible in `useSyncRegistry()` the same way regardless of its trigger.
 */
export const useSyncTaskReporter = ({
  id,
  enabled = true,
}: UseSyncTaskReporterOptions): SyncTaskReporter => {
  useEffect(() => {
    if (!enabled) return;
    const { registerTask, unregisterTask } = useSyncRegistryStore.getState();
    registerTask(id);
    return () => unregisterTask(id);
  }, [enabled, id]);

  return useMemo<SyncTaskReporter>(
    () => ({
      reportStart: () => {
        useSyncRegistryStore.getState().setStatus(id, 'syncing');
        useSyncLogStore.getState().append({ taskId: id, status: 'syncing' });
      },
      reportSuccess: () => {
        useSyncRegistryStore.getState().setStatus(id, 'idle');
        useSyncLogStore.getState().append({ taskId: id, status: 'idle' });
      },
      reportError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        useSyncRegistryStore.getState().setStatus(id, 'error', message);
        useSyncLogStore.getState().append({ taskId: id, status: 'error', message });
      },
      reportPendingCount: (count) => useSyncRegistryStore.getState().setPendingCount(id, count),
    }),
    [id],
  );
};
