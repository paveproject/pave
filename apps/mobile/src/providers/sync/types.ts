export type SyncTaskStatus = 'idle' | 'syncing' | 'error';

/**
 * No display label here on purpose - the registry is data, not UI. A
 * consumer (the eventual debug screen) maps `id` to a translated string
 * via `use-intl` at render time, so it follows the device's language
 * instead of being frozen into whatever was hardcoded when the task
 * registered.
 */
export interface SyncTaskState {
  status: SyncTaskStatus;
  pendingCount: number;
  lastSyncedAt: number | null;
  lastError: string | null;
}

/** Known task ids, centralized so call sites can't typo one - add a line here when a new domain registers. */
export const SYNC_TASK_IDS = {
  reports: 'reports',
  me: 'me',
  recoveryKey: 'recovery-key',
  receiveShares: 'receive-shares',
  recoveryRequestCompletion: 'recovery-request-completion',
  mnemonicUpload: 'recovery-mnemonic-upload',
  meshRelay: 'mesh-relay',
} as const;

export type SyncTaskId = (typeof SYNC_TASK_IDS)[keyof typeof SYNC_TASK_IDS];
