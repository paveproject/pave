import {
  meAvatarControllerDelete,
  meAvatarControllerSet,
  meControllerUpdate,
  MeControllerUpdateData,
  mePushTokensControllerSetMutation,
  Options,
} from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { meKeys } from './meKeys';

export const useMeUpdateMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      body: { avatar, ...body },
      ...variables
    }: Options<MeControllerUpdateData, false> & { body: { avatar?: File | null } }) => {
      if (avatar === null) {
        const { data, error } = await meAvatarControllerDelete();
        if (error) throw error;
        if (data === undefined) throw new Error('No data');
      } else if (avatar) {
        const formData = new FormData();
        formData.append('file', avatar);
        const { data, error } = await meAvatarControllerSet({
          body: formData as unknown as { file: File },
          bodySerializer: (formData) => formData,
        });
        if (error) throw error;
        if (data === undefined) throw new Error('No data');
      }
      const { data, error } = await meControllerUpdate({
        ...variables,
        body,
      });
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
    ...mePushTokensControllerSetMutation(),
  });
};
