import { queryOptions } from '@tanstack/react-query';
import { meKeys } from './meKeys';
import { getMe, getPendingActions, listDevices } from '@libs/api-js';

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

export const devicesOptions = () => {
  return queryOptions({
    queryKey: meKeys.devices(),
    queryFn: async () => {
      const { data, error } = await listDevices();
      if (error) throw error;
      return data;
    },
  });
};

/** Fetched on launch, kept live via `useUserEventsSocket`, and refetched
 * on every app refocus with no extra code - `ReactQueryProvider.tsx`
 * already wires `AppState` into react-query's global `focusManager`, so
 * this plain `useQuery` gets that automatically. This is what covers a
 * device that was offline at the exact moment a realtime event fired. */
export const pendingActionsOptions = () => {
  return queryOptions({
    queryKey: meKeys.pendingActions(),
    queryFn: async () => {
      const { data, error } = await getPendingActions();
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
};
