import { redeemInvite, revokeTrustedContact } from '@libs/api-js';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { userKeys } from '../user/userKeys';
import { userTrustedContactsOptions } from '../user/userOptions';

/** Joining someone else's net: keyed by the code in the body, not by a
 * user, so there is no owner in the path. */
export const useRedeemInviteMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await redeemInvite({ body: { code } });
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      // Returns the new "trusted by" row, readable straight from the
      // caller's `onSuccess` without waiting on the invalidation below.
      return data;
    },
    onSuccess: () => {
      if (!userId) return;
      queryClient.invalidateQueries({ queryKey: userKeys.trustedContactOf({ userId }) });
    },
  });
};

export const useRevokeTrustedContactMutation = ({ userId }: { userId?: string }) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await revokeTrustedContact({ path: { trusted_contact_id: id } });
      if (error) throw error;
      return id;
    },
    // Removed straight from the cache rather than invalidated, so the row's
    // exit animation plays instead of the list flashing.
    onSuccess: (id) => {
      queryClient.setQueryData(userTrustedContactsOptions({ userId }).queryKey, (previous) =>
        previous?.filter((contact) => contact.id !== id),
      );
    },
  });
};
