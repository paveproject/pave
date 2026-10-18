import { queryOptions } from '@tanstack/react-query';
import { getCurrentRecoveryRequest, listRecoveryRequestShares } from '@libs/api-js';
import { recoveryRequestsKeys } from './recoveryRequestsKeys';

/** `null`, not a thrown error, when there's no pending request - that's
 * the expected steady state for almost every user, not a failure. */
export const recoveryRequestCurrentOptions = () =>
  queryOptions({
    queryKey: recoveryRequestsKeys.current(),
    queryFn: async () => {
      const { data, error, response } = await getCurrentRecoveryRequest();
      if (response.status === 404) return null;
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });

/** Empty, not a thrown error, while still within the mandatory delay
 * window (423) - the waiting screen polls this and just keeps showing its
 * countdown rather than treating that as a failure. */
export const recoveryRequestSharesOptions = (id: string) =>
  queryOptions({
    queryKey: recoveryRequestsKeys.shares(id),
    queryFn: async () => {
      const { data, error, response } = await listRecoveryRequestShares({ path: { id } });
      if (response.status === 423) return [];
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    enabled: !!id,
  });
