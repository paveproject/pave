import { useQuery } from '@tanstack/react-query';
import { checkUsernameAvailable } from '@libs/api-js';
import { meKeys } from './meKeys';

/**
 * Checks whether `username` is free. Pass `undefined` to disable the query
 * (e.g. while the value fails local format validation, or still matches the
 * signed-in user's current username).
 */
export const useUsernameAvailability = (username: string | undefined) => {
  return useQuery({
    queryKey: meKeys.usernameAvailable(username ?? ''),
    queryFn: async () => {
      const { data, error } = await checkUsernameAvailable({ query: { username: username! } });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data.available;
    },
    enabled: !!username,
    staleTime: 0,
  });
};
