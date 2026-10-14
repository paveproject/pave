import { redeemInvite, revokeTrustedContact } from '@libs/api-js';
import type { TrustedContactResponse } from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { trustedContactsKeys } from './trustedContactsKeys';

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
      queryClient.setQueryData<TrustedContactResponse[]>(trustedContactsKeys.mine(), (previous) =>
        previous?.filter((contact) => contact.id !== id),
      );
    },
  });
};
