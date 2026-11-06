import { queryOptions } from '@tanstack/react-query';
import {
  checkUsernameAvailable,
  getMe,
  getPendingActions,
  getRecoveryKeyMnemonic,
} from '@libs/api-js';
import { meKeys } from './meKeys';
import { utilsKeys } from '../utilsKeys';

/* --------------------------------- Profile -------------------------------- */

export const meOptions = () =>
  queryOptions({
    queryKey: meKeys.details(),
    queryFn: async () => {
      const { data, error } = await getMe();
      if (error) throw error;
      return data;
    },
  });

/**
 * Whether `username` is free to take.
 *
 * Its key deliberately sits under `utils`, not `meKeys` - this is a live
 * uniqueness check against whatever is typed right now, not account data, so
 * it must never be caught by `ReactQueryProvider`'s `meKeys.base`-prefixed
 * persistence. A result cached from a previous session, against a username
 * since taken or freed, would otherwise be served from disk on launch before
 * `staleTime: 0`'s refetch can correct it.
 */
export const meUsernameAvailableOptions = (username: string | undefined) =>
  queryOptions({
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

/* ----------------------------- Pending actions ---------------------------- */

/** Fetched on launch, kept live by `useUserEventsSocket`, and refetched on
 * every app refocus for free - `ReactQueryProvider` wires `AppState` into
 * react-query's `focusManager`. That is what covers a device that was offline
 * at the exact moment a realtime event fired. */
export const mePendingActionsOptions = () =>
  queryOptions({
    queryKey: meKeys.pendingActions(),
    queryFn: async () => {
      const { data, error } = await getPendingActions();
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });

/* -------------------------- Recovery key mnemonic ------------------------- */

/** `null`, not a thrown error, when nothing has been set up yet - the expected
 * steady state until the user creates a recovery phrase. */
export const meRecoveryKeyMnemonicOptions = () =>
  queryOptions({
    queryKey: meKeys.recoveryKeyMnemonic(),
    queryFn: async () => {
      const { data, error, response } = await getRecoveryKeyMnemonic();
      if (response.status === 404) return null;
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
