import { useMeUpdateMutation } from '@libs/query-client';
import { PendingMeSync, useMeSyncStore } from '../../stores/useMeSyncStore';
import { useAuth } from '../../providers/AuthProvider';
import { useSyncTask } from '../../providers/sync/useSyncTask';
import { SYNC_TASK_IDS } from '../../providers/sync/types';

/**
 * Retries every offline-first `/me` field that couldn't be pushed to the
 * account at the time (offline, or the request failed) as soon as
 * connectivity comes back - one batched `PATCH /me` for whatever's
 * pending, instead of a separate request per field. Mount once near the
 * app root (see `providers/sync/SyncProvider.tsx`).
 */
export const useMeSync = () => {
  const { user } = useAuth();
  const { mutateAsync: updateMe } = useMeUpdateMutation();

  useSyncTask({
    id: SYNC_TASK_IDS.me,
    enabled: !!user,
    getPendingCount: () => Object.keys(useMeSyncStore.getState().pending).length,
    run: async () => {
      const { pending, clearPending } = useMeSyncStore.getState();
      const keys = Object.keys(pending) as (keyof PendingMeSync)[];
      if (keys.length === 0) return;
      await updateMe(pending);
      clearPending(keys);
    },
  });
};
