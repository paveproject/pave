import { useEffect } from 'react';
import { realtime } from '@libs/api-js';
// import { useUserCacheUpdate } from '../users';

export function useRealtimeSyncMe(enabled: boolean) {
  // const updateUserCache = useUserCacheUpdate();

  useEffect(() => {
    if (!enabled) return;

    return realtime.onMeEvents({
      onMeUpdated: (user) => {
        // updateUserCache(user, user);
      },
    });
  }, [enabled /*updateUserCache*/]);
}
