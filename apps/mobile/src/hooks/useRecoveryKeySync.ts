import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trustedContactsOptions, useSetSharesMutation } from '@libs/query-client';
import { commitReconciliation, planReconciliation, type AcceptedContact } from '../lib/recoveryKey';
import { useEnsureRecoveryIdentity } from './useEnsureRecoveryIdentity';
import { useAuth } from '../providers/AuthProvider';
import { logger } from '../logger';

/**
 * Keeps this user's recovery key split across their current accepted
 * trusted contacts (see `lib/recoveryKey`'s own doc comment for the
 * full picture) - reacts to the "mine" trusted-contacts list already
 * cached by `useQuery` below, so it re-runs on its own whenever that list
 * changes for any reason (a redeem, a revoke, a manual refresh), with no
 * separate wiring needed per action.
 *
 * Mounted app-wide (see `Providers.tsx`'s `RecoveryKeyBootstrap`), not
 * tied to the trusted-contacts screen being open - a rotation shouldn't
 * depend on the user happening to revisit that one screen.
 */
export const useRecoveryKeySync = () => {
  useEnsureRecoveryIdentity();

  const { user } = useAuth();
  const { data } = useQuery({ ...trustedContactsOptions(), enabled: !!user });
  const setShares = useSetSharesMutation();
  // Guards against overlapping runs if `data` changes again mid-flight
  // (e.g. a second realtime event) before the previous pass finished.
  const runningRef = useRef(false);

  useEffect(() => {
    if (!data || runningRef.current) return;
    runningRef.current = true;

    const run = async () => {
      try {
        const accepted: AcceptedContact[] = data
          .filter(
            (row): row is typeof row & { contact: NonNullable<(typeof row)['contact']> } =>
              row.status === 'accepted' && !!row.contact,
          )
          .map((row) => ({
            relationshipId: row.id,
            contactUserId: row.contact.id,
            contactPublicKey: row.contact.publicKey ?? null,
          }));

        const plan = await planReconciliation(accepted);
        if (plan.kind === 'rotate') {
          await setShares.mutateAsync(plan.uploads);
          await commitReconciliation(plan);
        }
      } catch (error) {
        logger.error('recovery key reconciliation failed', { error });
      } finally {
        runningRef.current = false;
      }
    };

    run();
  }, [data, setShares]);
};
