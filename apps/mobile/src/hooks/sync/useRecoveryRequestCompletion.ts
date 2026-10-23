import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import {
  devicesOptions,
  recoveryRequestCurrentOptions,
  recoveryRequestSharesOptions,
  trustedContactsOptions,
  useCancelRecoveryRequestMutation,
  useCompleteRecoveryRequestMutation,
} from '@libs/query-client';
import { completeRecovery, getDeviceId, peekRecoveryThreshold } from '../../lib/recoveryKey';
import { useAuth } from '../../providers/AuthProvider';
import { useReconcileMnemonicUpload } from './useReconcileMnemonicUpload';
import { useToast } from '../../components/Toast';
import { useSyncTaskReporter } from '../../providers/sync/useSyncTaskReporter';
import { SYNC_TASK_IDS } from '../../providers/sync/types';
import { logger } from '../../logger';

const POLL_INTERVAL_MS = 60_000;

/**
 * Background counterpart of the "recovery in progress" screen: once this
 * device has a pending recovery request of its own, polls `GET
 * /me/recovery-requests/{id}/shares` (a no-op while still within the
 * mandatory delay - see `recoveryRequestSharesOptions`'s own doc comment)
 * and, the moment enough same-generation shares are available, reconstructs
 * the DEK locally (`completeRecovery`) and marks the request `complete`
 * server-side - which also flips this device back to `active` (see
 * `complete_recovery_request`).
 *
 * Mounted app-wide (see `providers/sync/SyncProvider.tsx`), not tied
 * to the waiting screen being open - this still finishes even if the app
 * was backgrounded when the mandatory delay elapsed, the same reasoning
 * `useRecoveryKeySync`/`useReceiveShares` already apply to their own
 * reconciliation passes.
 *
 * Also the one place that auto-cancels a request the server itself can
 * never recognize as dead: the server only ever marks a request `failed`
 * when *zero* contacts approved (see `fail_if_unrecoverable`'s own doc
 * comment) - it has no way to tell "1 of 2 approved, but this account
 * needs 2-of-2" is just as unrecoverable, because it was never told the
 * threshold. This device has - the moment it's opened even one approved
 * share (see `peekRecoveryThreshold`) - so once every contact has
 * responded and what's approved still isn't enough, this calls the same
 * real `cancel` endpoint the "Cancel recovery" button does, rather than
 * leaving the request stuck showing "pending" forever, or faking a
 * `failed` status into the local cache that every other session and the
 * server itself would never agree with.
 */
export const useRecoveryRequestCompletion = () => {
  const t = useTranslations();
  const toast = useToast();
  const { user } = useAuth();
  const { data: request } = useQuery({ ...recoveryRequestCurrentOptions(), enabled: !!user });
  const requestId = request?.status === 'pending' ? request.id : undefined;

  const { data: shares } = useQuery({
    ...recoveryRequestSharesOptions(requestId ?? ''),
    enabled: !!requestId,
    refetchInterval: POLL_INTERVAL_MS,
  });
  const { data: contacts } = useQuery({ ...trustedContactsOptions(), enabled: !!requestId });
  const { data: devices } = useQuery({ ...devicesOptions(), enabled: !!requestId });
  const complete = useCompleteRecoveryRequestMutation();
  const cancel = useCancelRecoveryRequestMutation();
  const reporter = useSyncTaskReporter({
    id: SYNC_TASK_IDS.recoveryRequestCompletion,
    enabled: !!requestId,
  });
  const reconcileMnemonicUpload = useReconcileMnemonicUpload();

  // Avoids re-attempting the same (not-yet-sufficient) batch of shares on
  // every render - reset on a genuinely new poll result below.
  const attemptedSharesCount = useRef(0);

  useEffect(() => {
    if (!user || !requestId || !request || !shares || !contacts || !devices) return;
    reporter.reportPendingCount(shares.length);
    if (shares.length === 0 || shares.length === attemptedSharesCount.current) return;
    attemptedSharesCount.current = shares.length;
    reporter.reportStart();

    const eligibleContactIds = contacts
      .filter(
        (row): row is typeof row & { contact: NonNullable<(typeof row)['contact']> } =>
          row.status === 'accepted' && !!row.contact && row.contact.devices.length > 0,
      )
      .map((row) => row.contact.id);
    const run = async () => {
      try {
        // This device's own row may still say `pending` here - the server
        // isn't told to flip it `active` until `complete.mutate` below
        // succeeds - but it already holds the plaintext DEK it just
        // reconstructed, so it counts as "own" regardless of what its row
        // says *right now* (see `planReconciliation`'s own doc comment on
        // this exact exception). Every actual sibling still needs
        // `status === 'active'` - a suspended one (the normal state of
        // every sibling mid-recovery) hasn't earned the DEK back yet.
        const thisDeviceId = await getDeviceId(user.id);
        const ownDeviceIds = devices
          .filter((device) => device.status === 'active' || device.id === thisDeviceId)
          .map((device) => device.id);

        const recovered = await completeRecovery(user.id, shares, eligibleContactIds, ownDeviceIds);
        if (recovered) {
          complete.mutate(requestId);
          // This device may have set up a recovery phrase in a previous
          // life (before losing every device) - its cached key, if any,
          // needs to re-seal the DEK this just reconstructed.
          await reconcileMnemonicUpload(user.id);
          reporter.reportSuccess();
          return;
        }

        const threshold = await peekRecoveryThreshold(user.id, shares);
        if (threshold == null) {
          reporter.reportSuccess();
          return;
        }
        const stillPending =
          request.totalContacts - request.approvedContacts - request.declinedContacts;
        const maxPossibleApprovals = request.approvedContacts + stillPending;
        if (maxPossibleApprovals < threshold) {
          cancel.mutate(requestId, {
            onSuccess: () => {
              toast.info(t('pages.pending_actions.own_device.recovery.impossible'));
            },
          });
        }
        reporter.reportSuccess();
      } catch (error) {
        logger.error('recovery request completion failed', { error });
        reporter.reportError(error);
      }
    };

    run();
  }, [
    user,
    requestId,
    request,
    shares,
    contacts,
    devices,
    complete,
    cancel,
    toast,
    t,
    reporter,
    reconcileMnemonicUpload,
  ]);
};
