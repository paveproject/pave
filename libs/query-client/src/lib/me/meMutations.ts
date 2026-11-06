import {
  deleteAvatar,
  setAvatar,
  setPushToken,
  updateMe,
  MePushTokenSetRequest,
  MeUpdateRequest,
} from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { meOptions } from './meOptions';

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
