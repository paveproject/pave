import { approveDevice, declineDevice, revokeDevice, setDeviceDek } from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isNotFoundError, toApiCallError } from '../apiError';
import { pendingActionsOptions } from '../me/meOptions';
import { userDevicesOptions } from '../user/userOptions';

/**
 * `userId` is the owner whose cached device list these patch - the routes
 * themselves are addressed by device id and derive ownership server-side.
 */

/** A device can always target *itself* regardless of status; any other
 * device requires the caller to already be `active`. */
export const useRevokeDeviceMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await revokeDevice({ path: { device_id: id } });
      if (error) throw error;
      return id;
    },
    // Removed straight from the cache rather than invalidated: a refetch
    // flashes the list and cuts the row's exit animation short.
    onSuccess: (id) => {
      queryClient.setQueryData(userDevicesOptions({ userId }).queryKey, (previous) =>
        previous?.filter((device) => device.id !== id),
      );
      queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
        previous?.filter(
          (action) =>
            !(
              (action.kind === 'device_registration' ||
                action.kind === 'own_device_registration') &&
              action.id === id
            ),
        ),
      );
    },
  });
};

/** Deposits a sealed copy of this user's own recovery key for one of their
 * other devices - a direct seal, not a Shamir share. */
export const useSetDeviceDekMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deviceId, encryptedDek }: { deviceId: string; encryptedDek: string }) => {
      const { data, error } = await setDeviceDek({
        path: { device_id: deviceId },
        body: { encryptedDek },
      });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (device) => {
      queryClient.setQueryData(userDevicesOptions({ userId }).queryKey, (previous) =>
        previous?.map((d) => (d.id === device.id ? device : d)),
      );
    },
  });
};

/** A bank-style approval of one of this same user's own pending sibling
 * devices - `useRecoveryKeySync` delivers the key on its next pass. */
export const useApproveDeviceMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await approveDevice({ path: { device_id: id } });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (device) => {
      queryClient.setQueryData(userDevicesOptions({ userId }).queryKey, (previous) =>
        previous?.map((d) => (d.id === device.id ? device : d)),
      );
      queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
        previous?.filter(
          (action) => !(action.kind === 'device_registration' && action.id === device.id),
        ),
      );
    },
    // A 404 means this device was already resolved elsewhere - drop it so
    // the no-longer-dismissible validation screen can still close itself.
    onError: (error, id) => {
      if (isNotFoundError(error)) {
        queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
          previous?.filter(
            (action) => !(action.kind === 'device_registration' && action.id === id),
          ),
        );
      }
    },
  });
};

/** Nothing was ever granted to a pending device, so declining drops it. */
export const useDeclineDeviceMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await declineDevice({ path: { device_id: id } });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: ({ id }) => {
      queryClient.setQueryData(userDevicesOptions({ userId }).queryKey, (previous) =>
        previous?.filter((d) => d.id !== id),
      );
      queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
        previous?.filter((action) => !(action.kind === 'device_registration' && action.id === id)),
      );
    },
    onError: (error, id) => {
      if (isNotFoundError(error)) {
        queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
          previous?.filter(
            (action) => !(action.kind === 'device_registration' && action.id === id),
          ),
        );
      }
    },
  });
};
