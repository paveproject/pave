import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  devicesOptions,
  isConflictError,
  trustedContactsOptions,
  useReserveRecoveryDekGenerationMutation,
  useSetDeviceDekMutation,
  useSetSharesMutation,
} from '@libs/query-client';
import {
  commitReconciliation,
  getDeviceId,
  planReconciliation,
  type AcceptedContact,
  type OwnDevice,
} from '../../lib/recoveryKey';
import { useEnsureRecoveryIdentity } from './useEnsureRecoveryIdentity';
import { useReconcileMnemonicUpload } from './useReconcileMnemonicUpload';
import { useAuth } from '../../providers/AuthProvider';
import { useSyncTaskReporter } from '../../providers/sync/useSyncTaskReporter';
import { SYNC_TASK_IDS } from '../../providers/sync/types';
import { logger } from '../../logger';

/**
 * Keeps this user's recovery key split across their current accepted
 * trusted contacts, *and* synced (full copy, no splitting) across their
 * own other devices (see `lib/recoveryKey`'s own doc comment for the
 * full picture) - one joint decision over one shared generation, not two
 * independent effects that could race to rotate and clobber each other's
 * write. Reacts to the "mine" trusted-contacts list and the "my devices"
 * list, both already cached by `useQuery` below, so it re-runs on its own
 * whenever either changes for any reason (a redeem, a revoke, a new
 * device registering, a device being revoked, a manual refresh), with no
 * separate wiring needed per action.
 *
 * Mounted app-wide (see `providers/sync/SyncProvider.tsx`), not tied to
 * the trusted-contacts screen being open - a rotation shouldn't depend on
 * the user happening to revisit that one screen.
 */
export const useRecoveryKeySync = () => {
  useEnsureRecoveryIdentity();

  const { user } = useAuth();
  const { data: contacts } = useQuery({ ...trustedContactsOptions(), enabled: !!user });
  const { data: devices } = useQuery({ ...devicesOptions(), enabled: !!user });
  const setShares = useSetSharesMutation();
  const setDeviceDek = useSetDeviceDekMutation();
  const reserveGeneration = useReserveRecoveryDekGenerationMutation();
  const reconcileMnemonicUpload = useReconcileMnemonicUpload();
  // Guards against overlapping runs if `contacts`/`devices` change again
  // mid-flight (e.g. a second realtime event) before the previous pass
  // finished.
  const runningRef = useRef(false);
  const reporter = useSyncTaskReporter({
    id: SYNC_TASK_IDS.recoveryKey,
    enabled: !!user,
  });

  useEffect(() => {
    if (!user || !contacts || !devices || runningRef.current) return;
    runningRef.current = true;
    reporter.reportStart();
    const userId = user.id;

    const run = async () => {
      try {
        const thisDeviceId = await getDeviceId(userId);
        if (!thisDeviceId) return;

        // Never rotate/reseal while this device itself isn't `active` yet -
        // a device waiting on a sibling's approval, or on a trusted-contact
        // recovery request, has no synced state and no siblings of its own
        // (see `create_recovery_request`'s own doc comment: starting one
        // hard-deletes every other device). Without this guard,
        // `planReconciliation` would see "no sibling devices, but eligible
        // contacts" and mint a brand-new DEK, silently overwriting the real
        // shares those contacts are holding - the exact data a recovery
        // request exists to reconstruct.
        const thisDevice = devices.find((device) => device.id === thisDeviceId);
        if (thisDevice?.status !== 'active') return;

        // Every pass, not just a `rotate` one below - this is what keeps
        // the recovery-phrase blob current even when nothing about
        // contacts/own-devices changed *from this device's perspective*
        // (e.g. a sibling pushed a DEK this device adopted via
        // `receiveDek` - see `useReceiveShares`), and gives free retry if
        // a previous upload failed mid-flight.
        await reconcileMnemonicUpload(userId);

        const accepted: AcceptedContact[] = contacts
          .filter(
            (row): row is typeof row & { contact: NonNullable<(typeof row)['contact']> } =>
              row.status === 'accepted' && !!row.contact,
          )
          .map((row) => ({
            relationshipId: row.id,
            contactUserId: row.contact.id,
            contactDevices: row.contact.devices.map((device) => ({
              deviceId: device.id,
              publicKey: device.publicKey,
            })),
          }));

        const allOwnDevices: OwnDevice[] = devices.map((device) => ({
          deviceId: device.id,
          publicKey: device.publicKey,
          isActive: device.status === 'active',
        }));

        const plan = await planReconciliation(userId, accepted, allOwnDevices, thisDeviceId);
        if (plan.kind === 'rotate') {
          if (plan.needsGenerationReservation) {
            try {
              await reserveGeneration.mutateAsync({ expectedGeneration: plan.previousGeneration });
            } catch (error) {
              if (!isConflictError(error)) throw error;
              // Lost the race - some other device minted the real DEK for
              // this exact rotation and is already sealing it to every
              // sibling, including this one (see `receiveDek`/
              // `useReceiveShares`). This plan is abandoned outright -
              // nothing was persisted locally (see `dek`'s own doc comment
              // on `ReconciliationPlan`), and the next change to
              // `contacts`/`devices` (or the winner's own incoming seal)
              // re-triggers this effect to pick up the real result.
              reporter.reportSuccess();
              return;
            }
          }

          const uploads: Promise<unknown>[] = plan.deviceDekUploads.map((upload) =>
            setDeviceDek.mutateAsync(upload),
          );
          if (plan.shareUploads.length > 0) {
            uploads.push(setShares.mutateAsync(plan.shareUploads));
          }
          await Promise.all(uploads);
          await commitReconciliation(userId, plan);
        }
        reporter.reportSuccess();
      } catch (error) {
        logger.error('recovery key reconciliation failed', { error });
        reporter.reportError(error);
      } finally {
        runningRef.current = false;
      }
    };

    run();
  }, [
    user,
    contacts,
    devices,
    setShares,
    setDeviceDek,
    reserveGeneration,
    reporter,
    reconcileMnemonicUpload,
  ]);
};
