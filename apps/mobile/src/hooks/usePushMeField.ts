import { useCallback } from 'react';
import { useMeUpdateMutation } from '@libs/query-client';
import { PendingMeSync, useMeSyncStore } from '../stores/useMeSyncStore';

/**
 * Write-then-push for one or more offline-first `/me` fields: marks
 * `patch` pending (instant, local, zero network), attempts the real
 * `PATCH /me`, and clears it on success. On failure (offline, or
 * anything else) it just stays pending - `useMeSync` retries on the next
 * reconnect. Shared by every offline-first field instead of each one
 * hand-rolling its own write/push/clear dance.
 */
export const usePushMeField = () => {
  const { mutateAsync: updateMe } = useMeUpdateMutation();
  const setPending = useMeSyncStore((state) => state.setPending);
  const clearPending = useMeSyncStore((state) => state.clearPending);

  return useCallback(
    async (patch: PendingMeSync) => {
      setPending(patch);
      try {
        await updateMe(patch);
        clearPending(Object.keys(patch) as (keyof PendingMeSync)[]);
      } catch {
        // Offline (or otherwise failed) - stays pending, useMeSync retries.
      }
    },
    [updateMe, setPending, clearPending],
  );
};
