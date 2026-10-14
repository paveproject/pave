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

export const trustedByOptions = () => {
  return queryOptions({
    queryKey: trustedContactsKeys.asContact(),
    queryFn: async () => {
      const { data, error } = await listAsContact();
      if (error) throw error;
      return data;
    },
  });
};
