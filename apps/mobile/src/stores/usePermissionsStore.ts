import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from './storage';

/**
 * Tracks whether Bluetooth permission has ever been explicitly requested
 * on this device - see `providers/PermissionsProvider.tsx`. Bluetooth
 * has no check-only probe, so on a fresh app launch there's no way to
 * tell "never asked" apart from "already decided" without calling
 * `requestBluetoothPermission()` itself, and calling it blind risks
 * firing a real OS prompt the very first time. Once we know a decision
 * has already been made at least once, though, calling it again is
 * always prompt-free (it just returns the cached OS decision) - so this
 * flag is what lets the provider silently refresh the real status on
 * every launch instead of showing a stale "not asked" for a permission
 * that was actually granted (or denied) in a previous session.
 */
interface PermissionsStore {
  bluetoothEverRequested: boolean;
  setBluetoothEverRequested: (requested: boolean) => void;
}

export const usePermissionsStore = create<PermissionsStore>()(
  persist(
    (set) => ({
      bluetoothEverRequested: false,
      setBluetoothEverRequested: (bluetoothEverRequested) => set({ bluetoothEverRequested }),
    }),
    {
      name: 'permissions-storage',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
