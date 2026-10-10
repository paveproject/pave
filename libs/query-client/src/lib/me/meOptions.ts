import { queryOptions } from '@tanstack/react-query';
import { meKeys } from './meKeys';
import { getMe } from '@libs/api-js';

export const meOptions = () => {
  return queryOptions({
    queryKey: meKeys.details(),
    queryFn: async () => {
      const { data, error } = await getMe();
      if (error) throw error;
      return data;
    },
  });
};
