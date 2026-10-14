import { redeemInvite, revokeTrustedContact, setShares } from '@libs/api-js';
import type { ShareUpdate } from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { trustedContactsKeys } from './trustedContactsKeys';
import { trustedContactsOptions } from './trustedContactsOptions';

export const useRedeemInviteMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { error } = await redeemInvite({ body: { code } });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: trustedContactsKeys.asContact() });
    },
  });
};

export const useRevokeTrustedContactMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await revokeTrustedContact({ path: { id } });
      if (error) throw error;
      return id;
    },
    // Removed straight from the cache instead of invalidating - an
    // invalidation would refetch the whole list, which flashes/reloads the
    // row's exit animation instead of letting it play cleanly.
    onSuccess: (id) => {
      queryClient.setQueryData(trustedContactsOptions().queryKey, (previous) =>
        previous?.filter((contact) => contact.id !== id),
      );
    },
  });
};

/** Batch-uploads every accepted contact's new sealed share in one call -
 * see `recoveryKey`'s own doc comment on why a rotation always touches
 * everyone's share together, not one contact at a time. */
export const useSetSharesMutation = () => {
  return useMutation({
    mutationFn: async (shares: ShareUpdate[]) => {
      const { error } = await setShares({ body: { shares } });
      if (error) throw error;
    },
  });
};
