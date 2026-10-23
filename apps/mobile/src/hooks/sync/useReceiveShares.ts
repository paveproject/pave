import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { devicesOptions, trustedByOptions } from '@libs/query-client';
import { receiveDek, receiveShare } from '../../lib/recoveryKey';
import { useAuth } from '../../providers/AuthProvider';
import { useDeviceId } from '../useDeviceId';
import { useReconcileMnemonicUpload } from './useReconcileMnemonicUpload';
import { useSyncTaskReporter } from '../../providers/sync/useSyncTaskReporter';
import { SYNC_TASK_IDS } from '../../providers/sync/types';

/**
 * Decrypts and caches every owner's current share entrusted to this
 * device, as a trusted contact, *and* a direct recovery-key copy from a
 * sibling device of this same user, if either is waiting (see
 * `lib/recoveryKey`'s own doc comment).
 *
 * Mounted app-wide (see `providers/sync/SyncProvider.tsx`), not tied to
 * any specific screen being open - the realtime event (see
 * `useUserEventsSocket`) only covers a rotation that happens while this
 * device is connected; these queries are what catch up one missed while
 * the app was closed, on the very next launch.
 *
 * `receiveShare`/`receiveDek` never throw (they return `false` on a
 * decrypt failure) - previously fire-and-forget here, so a failure was
 * invisible. Now awaited and reported, so it actually shows up.
 */
export const useReceiveShares = () => {
  const { user } = useAuth();
  const deviceId = useDeviceId();
  const { data: trustedBy } = useQuery({
    ...trustedByOptions(deviceId ?? undefined),
    enabled: !!user && !!deviceId,
  });
  const { data: devices } = useQuery({ ...devicesOptions(), enabled: !!user });
  const reporter = useSyncTaskReporter({
    id: SYNC_TASK_IDS.receiveShares,
    enabled: !!user,
  });
  const reconcileMnemonicUpload = useReconcileMnemonicUpload();

  useEffect(() => {
    if (!user) return;
    const pending = (trustedBy ?? []).filter(
      (row): row is typeof row & { encryptedShare: string } => !!row.encryptedShare,
    );
    reporter.reportPendingCount(pending.length);
    if (pending.length === 0) return;

    let cancelled = false;
    (async () => {
      reporter.reportStart();
      let hadFailure = false;
      for (const row of pending) {
        const ok = await receiveShare(user.id, row.owner.id, row.encryptedShare);
        if (!ok) hadFailure = true;
      }
      if (cancelled) return;
      if (hadFailure) {
        reporter.reportError('failed to decrypt one or more entrusted shares');
      } else {
        reporter.reportSuccess();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, trustedBy, reporter]);

  useEffect(() => {
    if (!user) return;
    const mine = devices?.find((device) => device.id === deviceId);
    if (!mine?.encryptedDek) return;

    const encryptedDek = mine.encryptedDek;
    let cancelled = false;
    (async () => {
      const ok = await receiveDek(user.id, encryptedDek);
      if (cancelled) return;
      if (!ok) {
        reporter.reportError('failed to decrypt the device DEK copy');
        return;
      }
      // A sibling pushed this DEK, not this device's own reconciliation
      // pass - `useRecoveryKeySync` would never notice the change on its
      // own (nothing about contacts/own-devices looks different from
      // here), so the recovery-phrase blob needs its own nudge.
      await reconcileMnemonicUpload(user.id);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, devices, deviceId, reporter, reconcileMnemonicUpload]);
};
