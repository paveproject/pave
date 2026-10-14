import { useEffect, useRef } from 'react';
import { useSetPublicKeyMutation } from '@libs/query-client';
import { ensureIdentityKeypair } from '../lib/recoveryKey';
import { useAuth } from '../providers/AuthProvider';
import { logger } from '../logger';

/**
 * Generates this device's recovery-key identity keypair on first use and
 * uploads the public half - needed both to receive a share (as a trusted
 * contact) and to seal one (as an owner), so both `useRecoveryKeySync`
 * and `useReceiveShares` call this rather than duplicating it. Mounted
 * app-wide (see `Providers.tsx`'s `RecoveryKeyBootstrap`), so it gates on
 * auth itself rather than relying on only being mounted on an
 * already-authenticated screen.
 */
export const useEnsureRecoveryIdentity = () => {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const setPublicKey = useSetPublicKeyMutation();

  // Kept fresh every render so the effect below can call the current
  // mutation without needing it in its dependency array.
  const mutateRef = useRef(setPublicKey.mutateAsync);
  useEffect(() => {
    mutateRef.current = setPublicKey.mutateAsync;
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    const run = async () => {
      const newPublicKey = await ensureIdentityKeypair();
      if (newPublicKey) await mutateRef.current(newPublicKey);
    };
    run().catch((error) => logger.error('ensure recovery identity failed', { error }));
  }, [isAuthenticated]);
};
