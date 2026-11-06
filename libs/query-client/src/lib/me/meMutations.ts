import {
  activateViaRecoveryKeyMnemonic,
  deleteAvatar,
  reserveRecoveryDekGeneration,
  setAvatar,
  setPushToken,
  setRecoveryKeyMnemonic,
  updateMe,
  MePushTokenSetRequest,
  MeUpdateRequest,
} from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toApiCallError } from '../apiError';
import { userDevicesOptions } from '../user/userOptions';
import { meOptions, mePendingActionsOptions, meRecoveryKeyMnemonicOptions } from './meOptions';

/* --------------------------- Profile and avatar --------------------------- */

/** The avatar rides along here rather than in its own hook: both endpoints
 * answer with the full `MeResponse`, so one call site means one cache write
 * instead of two racing ones. */
export const useMeUpdateMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ avatar, ...body }: MeUpdateRequest & { avatar?: File | null }) => {
      if (avatar === null) {
        const { data, error } = await deleteAvatar();
        if (error) throw error;
        if (data === undefined) throw new Error('No data');
      } else if (avatar) {
        const formData = new FormData();
        formData.append('file', avatar);
        const { data, error } = await setAvatar({
          body: formData as never,
          bodySerializer: (formData) => formData,
        });
        if (error) throw error;
        if (data === undefined) throw new Error('No data');
      }
      const { data, error } = await updateMe({ body });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(meOptions().queryKey, data);
    },
  });
};

/* -------------------------------- Push token ------------------------------ */

export const useMePushTokenSetMutation = () =>
  useMutation({
    mutationFn: async (body: MePushTokenSetRequest) => {
      const { error } = await setPushToken({ body });
      if (error) throw error;
    },
  });

/* -------------------------- Recovery key mnemonic ------------------------- */

/** Idempotent upsert - called at initial setup and silently on every later
 * DEK rotation (see mobile's `useReconcileMnemonicUpload`). */
export const useMeRecoveryKeyMnemonicSetMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { encryptedDek: string }) => {
      const { data, error, response } = await setRecoveryKeyMnemonic({ body });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(meRecoveryKeyMnemonicOptions().queryKey, data);
    },
  });
};

/** Activates the calling device immediately - no delay, no quorum. */
export const useMeRecoveryKeyMnemonicActivateMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error, response } = await activateViaRecoveryKeyMnemonic();
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    // Patched rather than invalidated: the response carries only this
    // device's row, but the server-side effect is known exactly - every other
    // device gets suspended - so Settings > Devices doesn't keep showing a
    // sibling as `active` until some unrelated refetch lands.
    onSuccess: (device) => {
      queryClient.setQueryData(userDevicesOptions({ userId }).queryKey, (previous) =>
        previous?.map((d) => (d.id === device.id ? device : { ...d, status: 'suspended' })),
      );
      queryClient.setQueryData(mePendingActionsOptions().queryKey, (previous) =>
        previous?.filter(
          (action) => !(action.kind === 'own_device_registration' && action.id === device.id),
        ),
      );
    },
  });
};

/* ------------------------- Recovery DEK generation ------------------------ */

/** A compare-and-swap guard around minting a new recovery DEK. Nothing to
 * patch, no query it owns. Throws on a lost race (409) rather than returning
 * a union - check it with `isConflictError`. */
export const useMeRecoveryDekGenerationReserveMutation = () =>
  useMutation({
    mutationFn: async (body: { expectedGeneration: number }) => {
      const { data, error, response } = await reserveRecoveryDekGeneration({ body });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
