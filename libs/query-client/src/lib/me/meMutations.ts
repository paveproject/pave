import {
  deleteAvatar,
  setAvatar,
  setPublicKey,
  setPushToken,
  updateMe,
  SetPushTokenRequest,
  UpdateMeRequest,
} from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { meKeys } from './meKeys';

export const useMeUpdateMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ avatar, ...body }: UpdateMeRequest & { avatar?: File | null }) => {
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
      queryClient.setQueryData(meKeys.details(), data);
    },
  });
};

export const usePushTokenUpdateMutation = () => {
  return useMutation({
    mutationFn: async (body: SetPushTokenRequest) => {
      const { error } = await setPushToken({ body });
      if (error) throw error;
    },
  });
};

export const useSetPublicKeyMutation = () => {
  return useMutation({
    mutationFn: async (publicKey: string) => {
      const { error } = await setPublicKey({ body: { publicKey } });
      if (error) throw error;
    },
  });
};
