import {
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
import { devicesOptions, meOptions } from './meOptions';

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

export const useSetDeviceMutation = () => {
  return useMutation({
    mutationFn: async (body: { publicKey: string; deviceType: DeviceType }) => {
      const { data, error } = await setDevice({ body });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
};

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
