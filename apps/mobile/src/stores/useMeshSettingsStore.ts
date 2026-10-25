import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from './storage';

/**
 * Its own store, not folded into `useUIStore` - toggling this has real
 * side effects (OS Bluetooth permission prompts, starting/stopping BLE
 * central+peripheral roles), unlike `useUIStore`'s other flags, which are
 * all plain display preferences. See `settings/index.tsx`'s mesh-relay
 * section and `hooks/sync/useMeshRelay.ts`.
 */
interface MeshSettingsStore {
  meshRelayEnabled: boolean;
  setMeshRelayEnabled: (enabled: boolean) => void;
}

export const useMeshSettingsStore = create<MeshSettingsStore>()(
  persist(
    (set) => ({
      meshRelayEnabled: false,
      setMeshRelayEnabled: (meshRelayEnabled) => set({ meshRelayEnabled }),
    }),
    {
      name: 'mesh-settings-storage',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
