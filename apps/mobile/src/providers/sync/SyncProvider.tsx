import { useReportSync } from '../../hooks/sync/useReportSync';
import { useMeSync } from '../../hooks/sync/useMeSync';
import { useRecoveryKeySync } from '../../hooks/sync/useRecoveryKeySync';
import { useReceiveShares } from '../../hooks/sync/useReceiveShares';
import { useRecoveryRequestCompletion } from '../../hooks/sync/useRecoveryRequestCompletion';

/**
 * Single mount point for every sync task (see `useSyncTask`/
 * `useSyncTaskReporter`) - one provider instead of one bootstrap-per-
 * feature. Each hook below registers itself into `syncRegistryStore`, so
 * `useSyncRegistry()`/`useSyncTaskStatus()` (any component, anywhere) read
 * live status without needing to sit inside this provider's subtree.
 *
 * Mixes two different trigger models, both visible the same way: reports
 * retry on reconnect (`useSyncTask`); the recovery-key cluster reacts to
 * react-query cache changes or polls (`useSyncTaskReporter` directly) -
 * see each hook's own doc comment.
 */
export const SyncProvider = (): null => {
  useReportSync();
  useMeSync();
  useRecoveryKeySync();
  useReceiveShares();
  useRecoveryRequestCompletion();
  return null;
};
