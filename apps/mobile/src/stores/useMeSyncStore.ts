import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from './storage';
import type { MeUpdateRequest } from '@libs/api-js';

/**
 * `/me` fields that must work fully offline - picked/toggled with zero
 * network, pushed the moment connectivity returns. A `Pick` of
 * `MeUpdateRequest` rather than a hand-duplicated type, so it can't drift
 * from the backend's own shape.
 */
export type PendingMeSync = Pick<MeUpdateRequest, 'language' | 'protestModeEnabled'>;

interface MeSyncStore {
  pending: PendingMeSync;
  setPending: (patch: PendingMeSync) => void;
  clearPending: (keys: (keyof PendingMeSync)[]) => void;
}

/**
 * One unified offline-sync mechanism for every `/me` field that needs
 * it - MMKV (via the same `zustandStorage` `useUIStore` already uses)
 * instead of a one-off `AsyncStorage` pending-flag per field. MMKV reads
 * are synchronous, so `persist` hydrates this store synchronously too -
 * no boot-time loading race for anything that reads `pending` (see
 * `useProtestMode`, `AuthProvider`'s language guard).
 *
 * Adding another offline-first field is just adding its key to
 * `PendingMeSync` - see `usePushMeField`/`useMeSync` for the rest of the
 * mechanism (writing it, and retrying the push on reconnect).
 */
export const useMeSyncStore = create<MeSyncStore>()(
  persist(
    (set) => ({
      pending: {},
      setPending: (patch) => set((state) => ({ pending: { ...state.pending, ...patch } })),
      clearPending: (keys) =>
        set((state) => {
          const next = { ...state.pending };
          for (const key of keys) delete next[key];
          return { pending: next };
        }),
    }),
    {
      name: 'me-sync-storage',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
