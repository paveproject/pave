import { queryOptions } from '@tanstack/react-query';
import {
  checkUsernameAvailable,
  getMe,
  getPendingActions,
  getRecoveryKeyMnemonic,
  listMyDataAccessRequests,
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

/** Kept live by `useUserEventsSocket`; the refocus refetch is what covers a
 * device that was offline when an event fired. `refetchOnWindowFocus` is set
 * here because `ReactQueryProvider` turns it *off* globally - relying on the
 * wired `focusManager` alone silently did nothing. */
export const mePendingActionsOptions = () =>
  queryOptions({
    queryKey: meKeys.pendingActions(),
    queryFn: async () => {
      const { data, error } = await getPendingActions();
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    refetchOnWindowFocus: true,
  });

/* -------------------------- Data access requests -------------------------- */

/**
 * Requests the caller made, newest first.
 *
 * `staleTime: 0` and a refocus refetch because `access` turns over on the
 * clock alone - no event is sent at `releaseAt`, so a cached copy is wrong
 * from that instant. `useOwnerDataAccess` schedules a refetch for the app
 * that stays open across it.
 */
export const meDataAccessRequestsOptions = () =>
  queryOptions({
    queryKey: meKeys.dataAccessRequests(),
    queryFn: async () => {
      const { data, error } = await listMyDataAccessRequests();
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
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
