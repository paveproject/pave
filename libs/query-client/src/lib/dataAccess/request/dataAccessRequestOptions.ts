import { queryOptions } from '@tanstack/react-query';
import { getDataAccessRequest, listDataAccessRequestShares } from '@libs/api-js';
import { dataAccessRequestKeys } from './dataAccessRequestKeys';

/** Readable by both parties. */
export const dataAccessRequestOptions = ({
  dataAccessRequestId,
}: {
  dataAccessRequestId?: string;
}) =>
  queryOptions({
    queryKey: dataAccessRequestKeys.details({ dataAccessRequestId: dataAccessRequestId! }),
    queryFn: async () => {
      const { data, error, response } = await getDataAccessRequest({
        path: { data_access_request_id: dataAccessRequestId! },
      });
      if (response.status === 404) return null;
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    enabled: !!dataAccessRequestId,
  });

/** Empty rather than a throw on 423: the waiting screen keeps its countdown
 * instead of treating the delay as a failure. */
export const dataAccessRequestSharesOptions = ({
  dataAccessRequestId,
}: {
  dataAccessRequestId?: string;
}) =>
  queryOptions({
    queryKey: dataAccessRequestKeys.shares({ dataAccessRequestId: dataAccessRequestId! }),
    queryFn: async () => {
      const { data, error, response } = await listDataAccessRequestShares({
        path: { data_access_request_id: dataAccessRequestId! },
      });
      if (response.status === 423) return [];
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    enabled: !!dataAccessRequestId,
  });
