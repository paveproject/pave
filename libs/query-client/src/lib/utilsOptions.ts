import { queryOptions } from '@tanstack/react-query';
import { checkUsernameAvailable } from '@libs/api-js';
import { utilsKeys } from './utilsKeys';

/**
 * Whether `username` is free to take. Lives under its own `utils` key
 * namespace (not `meKeys`) deliberately - this is a live uniqueness check
 * against whatever's typed right now, not account data, so it must never
 * be picked up by `ReactQueryProvider`'s `meKeys.base`-prefixed
 * persistence (a result cached from a previous session - against a
 * username someone else has since taken, or freed up since - would
 * otherwise get served from disk on next launch before `staleTime: 0`'s
 * background refetch has a chance to correct it).
 */
export const usernameAvailableOptions = (username: string | undefined) => {
  return queryOptions({
    queryKey: utilsKeys.usernameAvailable(username ?? ''),
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
