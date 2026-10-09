import { queryOptions } from '@tanstack/react-query';
import { meKeys } from './meKeys';
import { meControllerGet } from '@libs/api-js';

export const meOptions = () => {
  return queryOptions({
    queryKey: meKeys.details(),
    queryFn: async () => {
      const { data, error } = await meControllerGet();
      if (error) throw error;
      return data;
    },
  });
};
