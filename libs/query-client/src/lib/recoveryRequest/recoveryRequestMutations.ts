import {
  approveRecoveryRequest,
  cancelRecoveryRequest,
  completeRecoveryRequest,
  declineRecoveryRequest,
} from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isNotFoundError, toApiCallError } from '../apiError';
import { mePendingActionsOptions } from '../me/meOptions';
import { userRecoveryRequestCurrentOptions } from '../user/userOptions';

export const useRecoveryRequestCancelMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await cancelRecoveryRequest({ path: { recovery_request_id: id } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData(userRecoveryRequestCurrentOptions({ userId }).queryKey, null);
    },
  });
};

/** Called once the requesting device has locally combined enough shares into
 * the recovered DEK - stops the request accepting further shares. */
export const useRecoveryRequestCompleteMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await completeRecoveryRequest({
        path: { recovery_request_id: id },
      });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(userRecoveryRequestCurrentOptions({ userId }).queryKey, data);
    },
  });
};

/** The contact's own already-held plaintext share, re-sealed to the
 * requesting device's public key before this is called. */
export const useRecoveryRequestApproveMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      recoveryRequestId,
      encryptedShare,
    }: {
      recoveryRequestId: string;
      encryptedShare: string;
    }) => {
      const { data, error, response } = await approveRecoveryRequest({
        path: { recovery_request_id: recoveryRequestId },
        body: { encryptedShare },
      });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (contact) => {
      queryClient.setQueryData(mePendingActionsOptions().queryKey, (previous) =>
        previous?.filter(
          (action) => !(action.kind === 'recovery_request_contact' && action.id === contact.id),
        ),
      );
    },
    // A 404 means the request was already resolved elsewhere - drop it so
    // the no-longer-dismissible validation screen can still close. Only
    // `recoveryRequestId` is available here, not the contact row's own id.
    onError: (error, { recoveryRequestId }) => {
      if (isNotFoundError(error)) {
        queryClient.setQueryData(mePendingActionsOptions().queryKey, (previous) =>
          previous?.filter(
            (action) =>
              !(
                action.kind === 'recovery_request_contact' &&
                action.recoveryRequestId === recoveryRequestId
              ),
          ),
        );
      }
    },
  });
};

export const useRecoveryRequestDeclineMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recoveryRequestId: string) => {
      const { data, error, response } = await declineRecoveryRequest({
        path: { recovery_request_id: recoveryRequestId },
      });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (contact) => {
      queryClient.setQueryData(mePendingActionsOptions().queryKey, (previous) =>
        previous?.filter(
          (action) => !(action.kind === 'recovery_request_contact' && action.id === contact.id),
        ),
      );
    },
    onError: (error, recoveryRequestId) => {
      if (isNotFoundError(error)) {
        queryClient.setQueryData(mePendingActionsOptions().queryKey, (previous) =>
          previous?.filter(
            (action) =>
              !(
                action.kind === 'recovery_request_contact' &&
                action.recoveryRequestId === recoveryRequestId
              ),
          ),
        );
      }
    },
  });
};
