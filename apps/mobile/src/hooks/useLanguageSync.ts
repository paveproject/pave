import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useMeUpdateMutation } from '@libs/query-client';
import { getPendingLanguage, setPendingLanguage } from '../lib/i18n';
import { useAuth } from '../providers/AuthProvider';

/**
 * Retries a locally-picked language that couldn't be pushed to the account
 * at the time (offline, or the request failed) as soon as connectivity
 * comes back - mirrors `useReportSync`. Mount once near the app root, below
 * `AuthProvider`/`ReactQueryProvider` (see `providers/Providers.tsx`).
 */
export const useLanguageSync = () => {
  const { user } = useAuth();
  const { mutateAsync: updateMe } = useMeUpdateMutation();
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      if (isOnline && wasOffline.current && user) {
        (async () => {
          const pending = await getPendingLanguage();
          if (!pending) return;
          try {
            await updateMe({ language: pending });
            await setPendingLanguage(null);
          } catch {
            // Still offline-ish, or another transient failure - leave it
            // pending, the next reconnect tries again.
          }
        })();
      }
      wasOffline.current = !isOnline;
    });

    return unsubscribe;
  }, [user, updateMe]);
};
