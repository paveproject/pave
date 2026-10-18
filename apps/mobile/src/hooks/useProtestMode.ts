import { useCallback } from 'react';
import { usePushMeField } from './usePushMeField';
import { useMeSyncStore } from '../stores/useMeSyncStore';
import { useAuth } from '../providers/AuthProvider';

/**
 * "Mode manif" - offline-first by design (see `usePushMeField`/`useMeSync`
 * for the write/push/retry mechanism). No dedicated Provider: unlike
 * language, nothing else in the app renders off this value client-side
 * (the delay it drives is computed server-side, at recovery-request
 * creation), so a self-contained hook is enough. MMKV-backed, so `pending`
 * is available synchronously from the very first render - no boot-time
 * loading state needed.
 */
export const useProtestMode = () => {
  const { user } = useAuth();
  const pending = useMeSyncStore((state) => state.pending.protestModeEnabled);
  const pushMeField = usePushMeField();

  const enabled = pending ?? user?.protestModeEnabled ?? false;

  const toggle = useCallback(
    () => pushMeField({ protestModeEnabled: !enabled }),
    [pushMeField, enabled],
  );

  return { enabled, toggle };
};
