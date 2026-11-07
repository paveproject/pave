import {
  approveDataAccessRequest,
  cancelDataAccessRequest,
  declineDataAccessRequest,
  refuseDataAccessRequest,
} from '@libs/api-js';
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { DataAccessRequestResponse } from '@libs/api-js';
import { toApiCallError } from '../../apiError';
import { mePendingActionsOptions, meDataAccessRequestsOptions } from '../../me/meOptions';
import { userKeys } from '../../user/userKeys';
import { dataAccessRequestKeys } from './dataAccessRequestKeys';

/** That list is the requester side's only source, so a mutation that doesn't
 * patch it leaves the screen stale until the next refetch. */
export const upsertMyDataAccessRequest = (
  queryClient: QueryClient,
  request: DataAccessRequestResponse,
) => {
  queryClient.setQueryData(meDataAccessRequestsOptions().queryKey, (previous) =>
    previous?.some((row) => row.id === request.id)
      ? previous.map((row) => (row.id === request.id ? request : row))
      : [request, ...(previous ?? [])],
  );
};

/** Not a vote: `encryptedShare` is required because without the envelope
 * there is nothing for the requester to combine. */
export const useDataAccessRequestApproveMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      dataAccessRequestId,
      encryptedShare,
    }: {
      dataAccessRequestId: string;
      encryptedShare: string;
    }) => {
      const { data, error, response } = await approveDataAccessRequest({
        path: { data_access_request_id: dataAccessRequestId },
        body: { encryptedShare },
      });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    // The approver's own inbox; the realtime event covers everyone else.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mePendingActionsOptions().queryKey });
    },
  });
};

export const useDataAccessRequestDeclineMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dataAccessRequestId: string) => {
      const { data, error, response } = await declineDataAccessRequest({
        path: { data_access_request_id: dataAccessRequestId },
      });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: mePendingActionsOptions().queryKey });
    },
  });
};

/** The owner's veto. Works during the delay **and** after access opened. */
export const useDataAccessRequestRefuseMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dataAccessRequestId: string) => {
      const { data, error, response } = await refuseDataAccessRequest({
        path: { data_access_request_id: dataAccessRequestId },
      });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (request) => {
      queryClient.setQueryData(
        dataAccessRequestKeys.details({ dataAccessRequestId: request.id }),
        request,
      );
      if (userId) {
        queryClient.invalidateQueries({
          queryKey: userKeys.dataAccessRequestCurrent({ userId }),
        });
      }
    },
  });
};

/** Separate from the owner's refusal: the route only accepts the requester,
 * and the status becomes `cancelled`, not `refused`. */
export const useDataAccessRequestCancelMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dataAccessRequestId: string) => {
      const { data, error, response } = await cancelDataAccessRequest({
        path: { data_access_request_id: dataAccessRequestId },
      });
      if (error) throw toApiCallError(response.status, error);
      if (data === undefined) throw new Error('No data');
      return data;
    },
    onSuccess: (request) => {
      queryClient.setQueryData(
        dataAccessRequestKeys.details({ dataAccessRequestId: request.id }),
        request,
      );
      upsertMyDataAccessRequest(queryClient, request);
    },
  });
};
