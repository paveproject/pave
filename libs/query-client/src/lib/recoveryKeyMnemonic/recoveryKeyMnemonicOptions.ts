import { queryOptions } from '@tanstack/react-query';
import { getRecoveryKeyMnemonic } from '@libs/api-js';
import { recoveryKeyMnemonicKeys } from './recoveryKeyMnemonicKeys';

/** `null`, not a thrown error, when nothing's been set up yet - that's
 * the expected steady state until the user has set up a recovery
 * phrase. */
export const recoveryKeyMnemonicOptions = () =>
  queryOptions({
    queryKey: recoveryKeyMnemonicKeys.detail(),
    queryFn: async () => {
      const { data, error, response } = await getRecoveryKeyMnemonic();
      if (response.status === 404) return null;
      if (error) throw error;
      if (data === undefined) throw new Error('No data');
      return data;
    },
  });
