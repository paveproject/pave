import { queryOptions } from '@tanstack/react-query';
import { meKeys } from './meKeys';
import { getMe, getPendingActions } from '@libs/api-js';

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

/** Fetched on launch, kept live by `useUserEventsSocket`, and refetched on
 * every app refocus for free - `ReactQueryProvider` wires `AppState` into
 * react-query's `focusManager`. That is what covers a device that was offline
 * at the exact moment a realtime event fired. */
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
