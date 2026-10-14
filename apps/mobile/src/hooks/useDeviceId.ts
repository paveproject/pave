import { useEffect, useState } from 'react';
import { getDeviceId } from '../lib/recoveryKey';

/**
 * This device's server-assigned `device` row id (see `PUT /me/devices`,
 * called once on launch by `useEnsureRecoveryIdentity`) - `null` until
 * that registration has completed at least once. Reused by every
 * consumer that needs to know "which device is this" (the "as-contact"
 * query, which resolves a per-device share - see `trustedByOptions` -
 * and the realtime socket handler that merges into the same cache entry).
 */
export const useDeviceId = () => {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDeviceId().then((id) => {
      if (!cancelled) setDeviceId(id);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return deviceId;
};
