import { useEffect } from 'react';
import { getDeviceId } from '../lib/recoveryKey';
import { useAuth } from '../providers/AuthProvider';
import { useDeviceIdStore } from '../stores/useDeviceIdStore';
import { logger } from '../logger';

/**
 * This device's server-assigned `device` row id (see `PUT /me/devices`,
 * called once on launch by `useEnsureRecoveryIdentity`) - `null` until
 * that registration has completed at least once. Reused by every
 * consumer that needs to know "which device is this" (the "as-contact"
 * query, which resolves a per-device share - see `trustedByOptions` -
 * and the realtime socket handler that merges into the same cache entry).
 *
 * Reads through `useDeviceIdStore` rather than holding its own state: a
 * single SecureStore read on mount is not enough, because registration
 * writes the id after a network round-trip and nothing told a hook that
 * had already read `null`. See the store for the symptom that caused.
 */
export const useDeviceId = () => {
  const { user } = useAuth();
  const userId = user?.id;
  // Filtered on read so a stale previous user's id never leaks out.
  const deviceId = useDeviceIdStore((state) => (state.userId === userId ? state.deviceId : null));

  useEffect(() => {
    if (!userId || deviceId) return;
    let cancelled = false;
    getDeviceId(userId)
      .then((id) => {
        if (!cancelled && id) useDeviceIdStore.getState().setDeviceId(userId, id);
      })
      .catch((error) => logger.error('device id lookup failed', { error }));
    return () => {
      cancelled = true;
    };
  }, [userId, deviceId]);

  return userId ? deviceId : null;
};
