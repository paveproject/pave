import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trustedByOptions } from '@libs/query-client';
import { receiveShare } from '../lib/recoveryKey';
import { useAuth } from '../providers/AuthProvider';

/**
 * Decrypts and caches every owner's current share entrusted to this
 * device, as a trusted contact (see `lib/recoveryKey`'s own doc comment).
 *
 * Mounted app-wide (see `Providers.tsx`'s `RecoveryKeyBootstrap`), not
 * tied to the "trusted by" screen being open - the realtime event (see
 * `useUserEventsSocket`) only covers a rotation that happens while this
 * device is connected; this query is what catches up a rotation missed
 * while the app was closed, on the very next launch rather than only if
 * the user happens to revisit that screen.
 */
export const useReceiveShares = () => {
  const { user } = useAuth();
  const { data } = useQuery({ ...trustedByOptions(), enabled: !!user });

  useEffect(() => {
    for (const row of data ?? []) {
      if (row.encryptedShare) {
        receiveShare(row.owner.id, row.encryptedShare);
      }
    }
  }, [data]);
};
