import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import type { SyncTaskState, SyncTaskStatus } from './types';

interface SyncRegistryStore {
  tasks: Record<string, SyncTaskState>;
  registerTask: (id: string) => void;
  unregisterTask: (id: string) => void;
  setPendingCount: (id: string, pendingCount: number) => void;
  setStatus: (id: string, status: SyncTaskStatus, error?: string) => void;
}

/**
 * Live status of every offline-first sync task (reports, `/me`, and the
 * recovery-key cluster), keyed by task id - see
 * `SYNC_TASK_IDS`. No persistence: this is runtime observability, not
 * data - it's rebuilt as each `useSyncTask` re-registers on mount. Backs
 * the eventual settings/debug sync screen, and any per-feature
 * "syncing..." indicator. Deliberately no display label stored here -
 * see `SyncTaskState`'s own doc comment.
 */
export const useSyncRegistryStore = create<SyncRegistryStore>()((set) => ({
  tasks: {},
  registerTask: (id) =>
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: state.tasks[id] ?? {
          status: 'idle',
          pendingCount: 0,
          lastSyncedAt: null,
          lastError: null,
        },
      },
    })),
  unregisterTask: (id) =>
    set((state) => {
      const next = { ...state.tasks };
      delete next[id];
      return { tasks: next };
    }),
  setPendingCount: (id, pendingCount) =>
    set((state) => {
      const task = state.tasks[id];
      if (!task) return state;
      return { tasks: { ...state.tasks, [id]: { ...task, pendingCount } } };
    }),
  setStatus: (id, status, error) =>
    set((state) => {
      const task = state.tasks[id];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            status,
            lastError: status === 'error' ? (error ?? 'unknown error') : task.lastError,
            lastSyncedAt: status === 'idle' ? Date.now() : task.lastSyncedAt,
          },
        },
      };
    }),
}));

export const useSyncRegistry = () => useSyncRegistryStore((state) => state.tasks);

export const useSyncTaskStatus = (id: string) => useSyncRegistryStore((state) => state.tasks[id]);

export const useIsAnySyncing = () =>
  useSyncRegistryStore((state) => Object.values(state.tasks).some((t) => t.status === 'syncing'));

/**
 * Sum of every task's `pendingCount` - used to warn before logout (see
 * `settings/index.tsx`'s `handleSignOut`) that signing out now abandons
 * whatever hasn't made it to the server yet (reports, offline-first `/me`
 * field edits - not the recovery-key tasks, which only ever pull from the
 * server and report nothing here).
 */
export const useTotalPendingSyncCount = () =>
  useSyncRegistryStore((state) =>
    Object.values(state.tasks).reduce((sum, task) => sum + task.pendingCount, 0),
  );

/**
 * Convenience bundle of the derived selectors above, for a call site that
 * wants several at once (e.g. a settings row showing both a spinner and a
 * count) without wiring up each hook separately. `useShallow` keeps this
 * from re-rendering on every registry change - only when one of these
 * three fields actually differs. Prefer the individual selectors above
 * when only one value is needed and render cost matters (e.g. a row that
 * re-renders per list item) - this bundle re-renders on a change to *any*
 * of the three, even if the caller only reads one.
 */
export const useSync = () =>
  useSyncRegistryStore(
    useShallow((state) => {
      const tasks = Object.values(state.tasks);
      return {
        tasks: state.tasks,
        isAnySyncing: tasks.some((t) => t.status === 'syncing'),
        totalPendingCount: tasks.reduce((sum, t) => sum + t.pendingCount, 0),
      };
    }),
  );
