import { queryOptions } from '@tanstack/react-query';
import { listRecoveryRequestShares } from '@libs/api-js';
import { recoveryRequestKeys } from './recoveryRequestKeys';

/** Empty, not a thrown error, while still inside the mandatory delay window
 * (423) - the waiting screen keeps showing its countdown instead of treating
 * that as a failure. */
export const recoveryRequestSharesOptions = ({
  recoveryRequestId,
}: {
  recoveryRequestId?: string;
}) =>
  queryOptions({
    queryKey: recoveryRequestKeys.shares({ recoveryRequestId: recoveryRequestId! }),
    queryFn: async () => {
      const { data, error, response } = await listRecoveryRequestShares({
        path: { recovery_request_id: recoveryRequestId! },
      });
      if (response.status === 423) return [];
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    enabled: !!recoveryRequestId,
  });
