import { queryOptions } from '@tanstack/react-query';
import {
  generateInvite,
  getCurrentDataAccessRequest,
  getCurrentRecoveryRequest,
  listAsContact,
  listDevices,
  listSessions,
  listTrustedContacts,
} from '@libs/api-js';
import { userKeys } from './userKeys';

/**
 * `userId` is optional on every factory here, with `enabled` gating the fetch:
 * several screens mount before `/me` has answered, and the alternative is each
 * of them branching on an id it doesn't have yet.
 */
export const userDevicesOptions = ({ userId }: { userId?: string }) =>
  queryOptions({
    queryKey: userKeys.devices({ userId: userId! }),
    queryFn: async () => {
      const { data, error } = await listDevices({ path: { user_id: userId! } });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

export const userProtestSessionsOptions = ({ userId }: { userId?: string }) =>
  queryOptions({
    queryKey: userKeys.protestSessions({ userId: userId! }),
    queryFn: async () => {
      const { data, error } = await listSessions({ path: { user_id: userId! } });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

export const userTrustedContactsOptions = ({ userId }: { userId?: string }) =>
  queryOptions({
    queryKey: userKeys.trustedContacts({ userId: userId! }),
    queryFn: async () => {
      const { data, error } = await listTrustedContacts({ path: { user_id: userId! } });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

/**
 * `deviceId` tells the server which of the caller's own devices is asking, so
 * it can resolve each row's one relevant `encryptedShare` out of potentially
 * several. Omit it to get every row with `encryptedShare: null`.
 */
export const userTrustedContactOfOptions = ({
  userId,
  deviceId,
}: {
  userId?: string;
  deviceId?: string;
}) =>
  queryOptions({
    queryKey: userKeys.trustedContactOf({ userId: userId!, deviceId }),
    queryFn: async () => {
      const { data, error } = await listAsContact({
        path: { user_id: userId! },
        query: { deviceId },
      });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

/** Every fetch rotates the code server-side, so this is invalidated (not
 * manually re-mutated) the moment it's redeemed. */
export const userTrustedContactInviteOptions = ({ userId }: { userId?: string }) =>
  queryOptions({
    queryKey: userKeys.trustedContactInvite({ userId: userId! }),
    queryFn: async () => {
      const { data, error } = await generateInvite({ path: { user_id: userId! } });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });

/** `null`, not a thrown error, when nothing is pending - the expected steady
 * state. A request here is somebody asking to read this account's recordings,
 * so the owner has to see it while the veto window is still open. */
export const userDataAccessRequestCurrentOptions = ({ userId }: { userId?: string }) =>
  queryOptions({
    queryKey: userKeys.dataAccessRequestCurrent({ userId: userId! }),
    queryFn: async () => {
      const { data, error, response } = await getCurrentDataAccessRequest({
        path: { user_id: userId! },
      });
      if (response.status === 404) return null;
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    enabled: !!userId,
  });

/** `null`, not a thrown error, when there's no pending request - the expected
 * steady state for almost every account. */
export const userRecoveryRequestCurrentOptions = ({ userId }: { userId?: string }) =>
  queryOptions({
    queryKey: userKeys.recoveryRequestCurrent({ userId: userId! }),
    queryFn: async () => {
      const { data, error, response } = await getCurrentRecoveryRequest({
        path: { user_id: userId! },
      });
      if (response.status === 404) return null;
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
    enabled: !!userId,
  });
