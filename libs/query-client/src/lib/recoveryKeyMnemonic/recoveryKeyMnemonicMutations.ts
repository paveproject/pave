import { activateViaRecoveryKeyMnemonic, setRecoveryKeyMnemonic } from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toApiCallError } from '../apiError';
import { devicesOptions, pendingActionsOptions } from '../me/meOptions';
import { recoveryKeyMnemonicOptions } from './recoveryKeyMnemonicOptions';

/** Idempotent upsert - called both at initial setup and silently on every
 * later DEK rotation (see mobile's `useReconcileMnemonicUpload`). */
export const useSetRecoveryKeyMnemonicMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { encryptedDek: string }) => {
      const { data, error, response } = await setRecoveryKeyMnemonic({ body });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(recoveryKeyMnemonicOptions().queryKey, data);
    },
  });
};

/** Activates the calling device immediately - no delay, no quorum (see
 * `handlers::activate_via_recovery_key_mnemonic`'s own doc comment). */
export const useActivateRecoveryKeyMnemonicMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await activateViaRecoveryKeyMnemonic();
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    // Same clean-exit reasoning as `useApproveDeviceMutation` - moves
    // straight to "this device is active" instead of waiting on a
    // refetch. The response only ever carries this one device's own row,
    // but the server-side effect is known precisely (see
    // `handlers::activate_via_recovery_key_mnemonic`'s own doc comment:
    // every *other* device gets suspended) - patched directly rather than
    // invalidated, so Settings > Devices doesn't keep showing a sibling as
    // `active` until some unrelated refetch happens to land.
    onSuccess: (device) => {
      queryClient.setQueryData(devicesOptions().queryKey, (previous) =>
        previous?.map((d) => (d.id === device.id ? device : { ...d, status: 'suspended' })),
      );
      queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
        previous?.filter(
          (action) => !(action.kind === 'own_device_registration' && action.id === device.id),
        ),
      );
    },
  });
};
