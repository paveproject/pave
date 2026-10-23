import { useCallback } from 'react';
import { useSetRecoveryKeyMnemonicMutation } from '@libs/query-client';
import { commitMnemonicUpload, planMnemonicUpload } from '../../lib/recoveryKey';
import { useSyncTaskReporter } from '../../providers/sync/useSyncTaskReporter';
import { SYNC_TASK_IDS } from '../../providers/sync/types';

/**
 * Keeps the account's recovery-phrase blob in sync with whatever the
 * local DEK currently is - a no-op on every device except the one
 * holding the cached mnemonic-derived key (see `storage.ts`'s own doc
 * comment), and a no-op there too once the server already has the
 * current DEK (see `planMnemonicUpload`).
 *
 * Call this after *any* point the local DEK may have changed - not just
 * this device's own rotations, but also after adopting one a sibling
 * pushed or one just reconstructed via trusted-contacts quorum (see
 * `useRecoveryKeySync`/`useReceiveShares`/`useRecoveryRequestCompletion`,
 * the three call sites).
 */
export const useReconcileMnemonicUpload = () => {
  const setMnemonic = useSetRecoveryKeyMnemonicMutation();
  const reporter = useSyncTaskReporter({ id: SYNC_TASK_IDS.mnemonicUpload });

  return useCallback(
    async (userId: string) => {
      const plan = await planMnemonicUpload(userId);
      if (!plan) return;

      reporter.reportStart();
      try {
        await setMnemonic.mutateAsync({ encryptedDek: plan.encryptedDek });
        await commitMnemonicUpload(userId, plan.dekFingerprint);
        reporter.reportSuccess();
      } catch (error) {
        // Retried for free the next time any of the three call sites
        // fires - no special backoff needed.
        reporter.reportError(error);
      }
    },
    [setMnemonic, reporter],
  );
};
