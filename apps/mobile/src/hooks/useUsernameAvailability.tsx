import { authClient } from '../lib/auth/client';
import { useQuery } from '@tanstack/react-query';

const useUsernameAvailability = (username?: string) => {
  return useQuery({
    queryKey: ['username-availability', username],
    queryFn: async () => {
      if (!username) return undefined;
      const { data, error } = await authClient.isUsernameAvailable({
        username,
      });
      if (error) throw error;
      return data.available;
    },
    enabled: !!username && username.length > 0,
  });
};

export { useUsernameAvailability };
