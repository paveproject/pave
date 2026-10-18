import {
  approveRecoveryRequest,
  cancelRecoveryRequest,
  completeRecoveryRequest,
  createRecoveryRequest,
  declineRecoveryRequest,
} from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isNotFoundError, toApiCallError } from '../apiError';
import { pendingActionsOptions } from '../me/meOptions';
import { recoveryRequestCurrentOptions } from './recoveryRequestsOptions';

/** The owner's last resort, once none of their own devices can help -
 * also hard-revokes every other device on the account server-side (see
 * `handlers::create_recovery_request`'s own doc comment), so this is a
 * deliberately irreversible action, not just another settings toggle. */
export const useCreateRecoveryRequestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await createRecoveryRequest();
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(recoveryRequestCurrentOptions().queryKey, data);
    },
  });
};

export const useCancelRecoveryRequestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await cancelRecoveryRequest({ path: { id } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.setQueryData(recoveryRequestCurrentOptions().queryKey, null);
    },
  });
};

/** Called once the requesting device has locally combined enough shares
 * into the recovered DEK (see `lib/recoveryKey`'s `completeRecovery`) -
 * stops the request from accepting further shares. */
export const useCompleteRecoveryRequestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await completeRecoveryRequest({ path: { id } });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(recoveryRequestCurrentOptions().queryKey, data);
    },
  });
};

/** The contact's own already-held plaintext share, re-sealed to the
 * requesting device's public key before this is called - see
 * `PendingActionsGate`, which is what actually does that sealing. */
export const useApproveRecoveryRequestMutation = () => {
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
        path: { id: recoveryRequestId },
        body: { encryptedShare },
      });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    // Same clean-exit reasoning as `useRevokeDeviceMutation` - moves
    // straight to the pending-actions queue's next item.
    onSuccess: (contact) => {
      queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
        previous?.filter(
          (action) => !(action.kind === 'recovery_request_contact' && action.id === contact.id),
        ),
      );
    },
    // See `apiError.ts`'s own doc comment: a 404 means this request was
    // already resolved (approved/declined/cancelled) elsewhere - drop it
    // so the no-longer-dismissible `/validation/recovery-request/[id]`
    // screen can still close instead of being stuck on a target that no
    // longer exists. Only `recoveryRequestId` is available here (not the
    // contact row's own `id`), so this matches on that field instead.
    onError: (error, { recoveryRequestId }) => {
      if (isNotFoundError(error)) {
        queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
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

export const useDeclineRecoveryRequestMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (recoveryRequestId: string) => {
      const { data, error, response } = await declineRecoveryRequest({
        path: { id: recoveryRequestId },
      });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (contact) => {
      queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
        previous?.filter(
          (action) => !(action.kind === 'recovery_request_contact' && action.id === contact.id),
        ),
      );
    },
    // See `useApproveRecoveryRequestMutation`'s own comment on why this
    // matters.
    onError: (error, recoveryRequestId) => {
      if (isNotFoundError(error)) {
        queryClient.setQueryData(pendingActionsOptions().queryKey, (previous) =>
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
