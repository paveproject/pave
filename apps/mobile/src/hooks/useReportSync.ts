import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { pushPendingReports } from '../lib/watermelon/reports';

/**
 * Retries every not-yet-synced local report as soon as connectivity comes
 * back - mount once near the app root (see `providers/Providers.tsx`).
 */
export const useReportSync = () => {
  const wasOffline = useRef(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      if (isOnline && wasOffline.current) {
        pushPendingReports();
      }
      wasOffline.current = !isOnline;
    });

    return unsubscribe;
  }, []);
};
