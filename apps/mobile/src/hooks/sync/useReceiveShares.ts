import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { devicesOptions, trustedByOptions } from '@libs/query-client';
import { receiveDek, receiveShare } from '../../lib/recoveryKey';
import { useAuth } from '../../providers/AuthProvider';
import { useDeviceId } from '../useDeviceId';

/**
 * Decrypts and caches every owner's current share entrusted to this
 * device, as a trusted contact, *and* a direct recovery-key copy from a
 * sibling device of this same user, if either is waiting (see
 * `lib/recoveryKey`'s own doc comment).
 *
 * Mounted app-wide (see `Providers.tsx`'s `RecoveryKeyBootstrap`), not
 * tied to any specific screen being open - the realtime event (see
 * `useUserEventsSocket`) only covers a rotation that happens while this
 * device is connected; these queries are what catch up one missed while
 * the app was closed, on the very next launch.
 */
export const useReceiveShares = () => {
  const { user } = useAuth();
  const deviceId = useDeviceId();
  const { data: trustedBy } = useQuery({
    ...trustedByOptions(deviceId ?? undefined),
    enabled: !!user && !!deviceId,
  });
  const { data: devices } = useQuery({ ...devicesOptions(), enabled: !!user });

  useEffect(() => {
    for (const row of trustedBy ?? []) {
      if (row.encryptedShare) {
        receiveShare(row.owner.id, row.encryptedShare);
      }
    }
  }, [trustedBy]);

  useEffect(() => {
    const mine = devices?.find((device) => device.id === deviceId);
    if (mine?.encryptedDek) {
      receiveDek(mine.encryptedDek);
    }
  }, [devices, deviceId]);
};
