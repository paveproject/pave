import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useSetDeviceMutation } from '@libs/query-client';
import { ensureIdentityKeypair, getIdentityPublicKeyHex, setDeviceId } from '../../lib/recoveryKey';
import { useAuth } from '../../providers/AuthProvider';
import { logger } from '../../logger';

/**
 * Generates this device's recovery-key identity keypair on first use, and
 * registers it with the server on *every* launch (not only when freshly
 * generated) - needed both to receive a share (as a trusted contact), to
 * seal one (as an owner), and to receive a direct DEK copy from a sibling
 * device, so both `useRecoveryKeySync` and `useReceiveShares` call this
 * rather than duplicating it.
 *
 * Registering unconditionally (not gated on "just generated a new
 * keypair") matters for two reasons: an existing device from before this
 * was built would otherwise never register at all, and the server-side
 * `(userId, publicKey)` row needs its `updated_at`/session refreshed on
 * every launch to stay a meaningful liveness signal. The server-side
 * upsert (`PUT /me/devices`) handles the idempotency, same pattern as
 * `NotificationsProvider`'s own unconditional push-token registration.
 *
 * Mounted app-wide (see `Providers.tsx`'s `RecoveryKeyBootstrap`), so it
 * gates on auth itself rather than relying on only being mounted on an
 * already-authenticated screen.
 */
export const useEnsureRecoveryIdentity = () => {
  const { user } = useAuth();
  const isAuthenticated = !!user;
  const setDevice = useSetDeviceMutation();

  // Kept fresh every render so the effect below can call the current
  // mutation without needing it in its dependency array.
  const mutateRef = useRef(setDevice.mutateAsync);
  useEffect(() => {
    mutateRef.current = setDevice.mutateAsync;
  });

  useEffect(() => {
    if (!isAuthenticated) return;
    const run = async () => {
      await ensureIdentityKeypair();
      const publicKey = await getIdentityPublicKeyHex();
      if (!publicKey) return;
      const device = await mutateRef.current({
        publicKey,
        deviceType: Platform.OS === 'ios' ? 'ios' : 'android',
      });
      await setDeviceId(device.id);
    };
    run().catch((error) => logger.error('ensure recovery identity failed', { error }));
  }, [isAuthenticated]);
};
