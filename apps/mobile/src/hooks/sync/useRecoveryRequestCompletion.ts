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
import { completeRecovery, peekRecoveryThreshold } from '../../lib/recoveryKey';
import { useAuth } from '../../providers/AuthProvider';
import { useToast } from '../../components/Toast';
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
 * Mounted app-wide (see `Providers.tsx`'s `RecoveryKeyBootstrap`), not tied
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

  // Avoids re-attempting the same (not-yet-sufficient) batch of shares on
  // every render - reset on a genuinely new poll result below.
  const attemptedSharesCount = useRef(0);

  useEffect(() => {
    if (!user || !requestId || !request || !shares || !contacts || !devices) return;
    if (shares.length === 0 || shares.length === attemptedSharesCount.current) return;
    attemptedSharesCount.current = shares.length;

    const eligibleContactIds = contacts
      .filter(
        (row): row is typeof row & { contact: NonNullable<(typeof row)['contact']> } =>
          row.status === 'accepted' && !!row.contact && row.contact.devices.length > 0,
      )
      .map((row) => row.contact.id);
    const ownDeviceIds = devices.map((device) => device.id);

    completeRecovery(user.id, shares, eligibleContactIds, ownDeviceIds)
      .then(async (recovered) => {
        if (recovered) {
          complete.mutate(requestId);
          return;
        }

        const threshold = await peekRecoveryThreshold(user.id, shares);
        if (threshold == null) return;
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
      })
      .catch((error) => {
        logger.error('recovery request completion failed', { error });
      });
  }, [user, requestId, request, shares, contacts, devices, complete, cancel, toast, t]);
};
