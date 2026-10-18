import {
  approveDevice,
  declineDevice,
  deleteAvatar,
  revokeDevice,
  setAvatar,
  setDevice,
  setDeviceDek,
  setPushToken,
  updateMe,
  DeviceType,
  MePushTokenSetRequest,
  MeUpdateRequest,
} from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isNotFoundError, toApiCallError } from '../apiError';
import { devicesOptions, meOptions, pendingActionsOptions } from './meOptions';

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

export const usePushTokenUpdateMutation = () => {
  return useMutation({
    mutationFn: async (body: MePushTokenSetRequest) => {
      const { error } = await setPushToken({ body });
      if (error) throw error;
    },
  });
};

/** `useEnsureRecoveryIdentity` calls this unconditionally on every launch,
 * well before anything else has a chance to notice this device might now
 * be a brand-new `own_device_registration` pending action (e.g. a fresh
 * install on an account that already has protected state elsewhere) -
 * relying solely on the `device_registered` realtime event to catch that
 * up races the websocket's own connection on a cold start, and nothing
 * else ever refetches `pendingActionsOptions` afterward. Invalidating it
 * here closes that gap without needing to reconstruct the full pending-
 * action shape (`approverDevices` isn't in this response) just to merge
 * it by hand. */
export const useSetDeviceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { publicKey: string; deviceType: DeviceType }) => {
      const { data, error } = await setDevice({ body });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (device) => {
      // Prepends on a brand-new device - matches `list_devices`'s own
      // newest-first `order_by_desc(CreatedAt)`, so this optimistic
      // update lands in the same spot a refetch would put it.
      queryClient.setQueryData(devicesOptions().queryKey, (old) => {
        if (!old) return old;
        const index = old.findIndex((d) => d.id === device.id);
        if (index === -1) return [device, ...old];
        const next = [...old];
        next[index] = device;
        return next;
      });
      queryClient.invalidateQueries({ queryKey: pendingActionsOptions().queryKey });
    },
  });
};

/** `revoke_device` lets a device always target *itself* regardless of
 * status (server-side, see `handlers::revoke_device`'s own doc comment)
 * - any other device requires the caller to already be `active`. */
export const useRevokeDeviceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await revokeDevice({ path: { id } });
      if (error) throw error;
      return id;
    },
    // Removed straight from the cache instead of invalidating - same
    // reasoning as `useRevokeTrustedContactMutation` (clean exit
    // animation, not a reload flash).
    onSuccess: (id) => {
      queryClient.setQueryData(devicesOptions().queryKey, (previous) =>
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

/** Deposits a sealed copy of this user's own recovery key for one of
 * their other devices - see `recoveryKey`'s own doc comment on why this
 * is a direct seal, not a Shamir share. */
export const useSetDeviceDekMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ deviceId, encryptedDek }: { deviceId: string; encryptedDek: string }) => {
      const { data, error } = await setDeviceDek({
        path: { id: deviceId },
        body: { encryptedDek },
      });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    // Updates the one device in the cached list straight from the
    // response, same reasoning as `useRevokeDeviceMutation` - no need to
    // refetch the whole list just to reflect this one row changing.
    onSuccess: (device) => {
      queryClient.setQueryData(devicesOptions().queryKey, (previous) =>
        previous?.map((d) => (d.id === device.id ? device : d)),
      );
    },
  });
};

/** A bank-style approval of one of this same user's own pending sibling
 * devices - see `useRecoveryKeySync`, which handles actually delivering
 * the key once the approved device shows up as eligible on this device's
 * next reconciliation pass. */
export const useApproveDeviceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await approveDevice({ path: { id } });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (device) => {
      queryClient.setQueryData(devicesOptions().queryKey, (previous) =>
        previous?.map((d) => (d.id === device.id ? device : d)),
      );
      // Same clean-exit reasoning as `useRevokeDeviceMutation` - the
      // pending-actions queue (see `usePendingActionsGate`) moves straight
      // to its next item instead of waiting on a refetch.
      queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
        previous?.filter(
          (action) => !(action.kind === 'device_registration' && action.id === device.id),
        ),
      );
    },
    // See `apiError.ts`'s own doc comment: a 404 here means this device
    // was already resolved (approved/declined/revoked) elsewhere - drop
    // it from the pending-actions cache so the no-longer-dismissible
    // `/validation/device/[id]` screen can still close itself instead of
    // being stuck on a target that no longer exists.
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

/** Nothing was ever granted to a pending device, so declining just drops
 * it - same hard-delete convention as `useRevokeDeviceMutation`. */
export const useDeclineDeviceMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await declineDevice({ path: { id } });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: ({ id }) => {
      queryClient.setQueryData(devicesOptions().queryKey, (previous) =>
        previous?.filter((d) => d.id !== id),
      );
      queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
        previous?.filter((action) => !(action.kind === 'device_registration' && action.id === id)),
      );
    },
    // See `useApproveDeviceMutation`'s own comment on why this matters.
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
