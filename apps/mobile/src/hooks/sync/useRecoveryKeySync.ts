import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  devicesOptions,
  trustedContactsOptions,
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
import { useAuth } from '../../providers/AuthProvider';
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
 * Mounted app-wide (see `Providers.tsx`'s `RecoveryKeyBootstrap`), not
 * tied to the trusted-contacts screen being open - a rotation shouldn't
 * depend on the user happening to revisit that one screen.
 */
export const useRecoveryKeySync = () => {
  useEnsureRecoveryIdentity();

  const { user } = useAuth();
  const { data: contacts } = useQuery({ ...trustedContactsOptions(), enabled: !!user });
  const { data: devices } = useQuery({ ...devicesOptions(), enabled: !!user });
  const setShares = useSetSharesMutation();
  const setDeviceDek = useSetDeviceDekMutation();
  // Guards against overlapping runs if `contacts`/`devices` change again
  // mid-flight (e.g. a second realtime event) before the previous pass
  // finished.
  const runningRef = useRef(false);

  useEffect(() => {
    if (!user || !contacts || !devices || runningRef.current) return;
    runningRef.current = true;
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
        }));

        const plan = await planReconciliation(userId, accepted, allOwnDevices, thisDeviceId);
        if (plan.kind === 'rotate') {
          const uploads: Promise<unknown>[] = plan.deviceDekUploads.map((upload) =>
            setDeviceDek.mutateAsync(upload),
          );
          if (plan.shareUploads.length > 0) {
            uploads.push(setShares.mutateAsync(plan.shareUploads));
          }
          await Promise.all(uploads);
          await commitReconciliation(userId, plan);
        }
      } catch (error) {
        logger.error('recovery key reconciliation failed', { error });
      } finally {
        runningRef.current = false;
      }
    };

    run();
  }, [user, contacts, devices, setShares, setDeviceDek]);
};
