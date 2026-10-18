import { queryOptions } from '@tanstack/react-query';
import { generateInvite, listAsContact, listTrustedContacts } from '@libs/api-js';
import { trustedContactsKeys } from './trustedContactsKeys';

export const trustedContactsOptions = () => {
  return queryOptions({
    queryKey: trustedContactsKeys.mine(),
    queryFn: async () => {
      const { data, error } = await listTrustedContacts();
      if (error) throw error;
      return data;
    },
  });
};

/**
 * The current user's own pending invite. Every fetch rotates the code
 * server-side (see `generate_invite`) - a plain `useQuery`, invalidated
 * (not manually re-mutated) the moment it's redeemed, is enough to get a
 * fresh one onto screen (see the "add trusted contact" screen).
 */
export const trustedContactInviteOptions = () => {
  return queryOptions({
    queryKey: trustedContactsKeys.invite(),
    queryFn: async () => {
      const { data, error } = await generateInvite();
      if (error) throw error;
      return data;
    },
  });
};

/**
 * `deviceId` tells the server which of the caller's own devices is asking,
 * so it can resolve each row's one relevant `encryptedShare` out of
 * potentially several (one per device the caller has registered). Omit it
 * to get every row with `encryptedShare: null` (e.g. before this device
 * has registered itself yet).
 */
export const trustedByOptions = (deviceId?: string) => {
  return queryOptions({
    queryKey: trustedContactsKeys.asContact(deviceId),
    queryFn: async () => {
      const { data, error } = await listAsContact({ query: { deviceId } });
      if (error) throw error;
      return data;
    },
  });
};
