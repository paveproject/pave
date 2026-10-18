import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useMeUpdateMutation } from '@libs/query-client';
import { PendingMeSync, useMeSyncStore } from '../../stores/useMeSyncStore';
import { useAuth } from '../../providers/AuthProvider';

/**
 * Retries every offline-first `/me` field that couldn't be pushed to the
 * account at the time (offline, or the request failed) as soon as
 * connectivity comes back - one listener, one batched `PATCH /me` for
 * whatever's pending, instead of a separate listener (and a separate
 * request) per field. Mount once near the app root, below
 * `AuthProvider`/`ReactQueryProvider` (see `providers/Providers.tsx`).
 */
export const useMeSync = () => {
  const { user } = useAuth();
  const { mutateAsync: updateMe } = useMeUpdateMutation();
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      if (isOnline && wasOffline.current && user) {
        const { pending, clearPending } = useMeSyncStore.getState();
        const keys = Object.keys(pending) as (keyof PendingMeSync)[];
        if (keys.length > 0) {
          updateMe(pending)
            .then(() => clearPending(keys))
            .catch(() => {
              // Still offline-ish, or another transient failure - leave it
              // pending, the next reconnect tries again.
            });
        }
      }
      wasOffline.current = !isOnline;
    });

    return unsubscribe;
  }, [user, updateMe]);
};
