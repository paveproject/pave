import { create } from 'zustand';

/**
 * `__DEV__` display counters for `settings/debug/mesh.tsx` - deliberately
 * separate from `relay.ts`'s dedup map (that one is real relay state;
 * this is purely for showing traffic on the debug screen) and not
 * persisted - a relaunch resetting these to zero is expected and fine.
 */
interface MeshDebugStore {
  sentCount: number;
  relayedCount: number;
  receivedCount: number;
  peerCount: number;
  recordSent: () => void;
  recordRelayed: () => void;
  recordReceived: () => void;
  setPeerCount: (count: number) => void;
}

export const useMeshDebugStore = create<MeshDebugStore>((set) => ({
  sentCount: 0,
  relayedCount: 0,
  receivedCount: 0,
  peerCount: 0,
  recordSent: () => set((state) => ({ sentCount: state.sentCount + 1 })),
  recordRelayed: () => set((state) => ({ relayedCount: state.relayedCount + 1 })),
  recordReceived: () => set((state) => ({ receivedCount: state.receivedCount + 1 })),
  setPeerCount: (count) => set({ peerCount: count }),
}));
