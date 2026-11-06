import { createRecoveryRequest, setDevice, setShares } from '@libs/api-js';
import type { DeviceType, MeTrustedContactsShareUpdate } from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mePendingActionsOptions } from '../me/meOptions';
import { userDevicesOptions, userRecoveryRequestCurrentOptions } from './userOptions';

/** `useEnsureRecoveryIdentity` calls this on every launch, well before
 * anything else notices this device might now be a pending
 * `own_device_registration` - relying on the realtime event races the
 * websocket's own connection on a cold start, and nothing else refetches
 * `mePendingActionsOptions` afterward. */
export const useUserDevicesSetMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { publicKey: string; deviceType: DeviceType }) => {
      if (!userId) throw new Error('No user id');
      const { data, error } = await setDevice({ path: { user_id: userId }, body });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (device) => {
      // Prepends a brand-new device, matching `list_devices`'s own
      // newest-first order, so this lands where a refetch would put it.
      queryClient.setQueryData(userDevicesOptions({ userId }).queryKey, (old) => {
        if (!old) return old;
        const index = old.findIndex((d) => d.id === device.id);
        if (index === -1) return [device, ...old];
        const next = [...old];
        next[index] = device;
        return next;
      });
      queryClient.invalidateQueries({ queryKey: mePendingActionsOptions().queryKey });
    },
  });
};

/** Batch-uploads every accepted contact's new sealed share in one call - a
 * rotation always touches everyone's share together. */
export const useUserTrustedContactSharesSetMutation = ({ userId }: { userId?: string }) => {
  return useMutation({
    mutationFn: async (shares: MeTrustedContactsShareUpdate[]) => {
      if (!userId) throw new Error('No user id');
      const { error } = await setShares({ path: { user_id: userId }, body: { shares } });
      if (error) throw error;
    },
  });
};

/** The owner's last resort, once none of their own devices can help. Also
 * hard-revokes every other device on the account server-side, so this is
 * deliberately irreversible. */
export const useUserRecoveryRequestsCreateMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('No user id');
      const { data, error } = await createRecoveryRequest({ path: { user_id: userId } });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(userRecoveryRequestCurrentOptions({ userId }).queryKey, data);
      // The response carries the request, not the suspended devices' rows,
      // so there is nothing to patch the devices cache with - the one case
      // that genuinely needs an invalidation.
      queryClient.invalidateQueries({ queryKey: userDevicesOptions({ userId }).queryKey });
    },
  });
};
