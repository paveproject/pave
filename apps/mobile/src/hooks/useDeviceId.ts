import { useEffect, useState } from 'react';
import { getDeviceId } from '../lib/recoveryKey';
import { useAuth } from '../providers/AuthProvider';

/**
 * This device's server-assigned `device` row id (see `PUT /me/devices`,
 * called once on launch by `useEnsureRecoveryIdentity`) - `null` until
 * that registration has completed at least once. Reused by every
 * consumer that needs to know "which device is this" (the "as-contact"
 * query, which resolves a per-device share - see `trustedByOptions` -
 * and the realtime socket handler that merges into the same cache entry).
 */
export const useDeviceId = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    getDeviceId(userId).then((id) => {
      if (!cancelled) setDeviceId(id);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Filtered here instead of resetting `deviceId` itself in the effect
  // above (a synchronous `setState` right in the effect body, on sign-out)
  // - a stale previous user's id never leaks out, without the extra render
  // that resetting the state would cause.
  return userId ? deviceId : null;
};
