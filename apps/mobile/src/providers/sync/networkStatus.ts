import { onlineManager } from '@tanstack/react-query';
import { create } from 'zustand';

interface NetworkStatusStore {
  isOnline: boolean;
}

/**
 * Mirrors TanStack Query's own `onlineManager` (wired to `NetInfo` once,
 * in `ReactQueryProvider.tsx`) instead of running a second, independent
 * `NetInfo` listener - `useSyncTask`'s reconnect trigger and every
 * `useMutation`'s pause/resume now react to the exact same connectivity
 * signal.
 */
export const useNetworkStatusStore = create<NetworkStatusStore>(() => ({
  isOnline: onlineManager.isOnline(),
}));

let unsubscribe: (() => void) | null = null;
let refCount = 0;

/** Ref-counted: cheap to call from every `useSyncTask` mount, only subscribes once. */
export const acquireNetworkStatusListener = (): (() => void) => {
  refCount += 1;
  if (!unsubscribe) {
    unsubscribe = onlineManager.subscribe(() => {
      useNetworkStatusStore.setState({ isOnline: onlineManager.isOnline() });
    });
  }

  return () => {
    refCount -= 1;
    if (refCount <= 0 && unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
  };
};
