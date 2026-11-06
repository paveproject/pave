import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from './storage';

/**
 * Device-local, not `/me` fields: they change this phone's behaviour only,
 * following the same rule as `useMeshSettingsStore`.
 */
interface ProtestSettingsStore {
  gpsEnabled: boolean;
  gpsIntervalSeconds: number;
  /** The knob that matters for the threat model: the maximum amount of
   * recording a seized phone can still be holding. */
  cloudSyncIntervalSeconds: number;
  setGpsEnabled: (enabled: boolean) => void;
  setGpsIntervalSeconds: (seconds: number) => void;
  setCloudSyncIntervalSeconds: (seconds: number) => void;
}

export const GPS_INTERVAL_BOUNDS = { min: 10, max: 180, step: 10 } as const;
export const CLOUD_SYNC_INTERVAL_BOUNDS = { min: 30, max: 900, step: 30 } as const;

export const useProtestSettingsStore = create<ProtestSettingsStore>()(
  persist(
    (set) => ({
      gpsEnabled: true,
      gpsIntervalSeconds: 30,
      cloudSyncIntervalSeconds: 60,
      setGpsEnabled: (gpsEnabled) => set({ gpsEnabled }),
      setGpsIntervalSeconds: (gpsIntervalSeconds) => set({ gpsIntervalSeconds }),
      setCloudSyncIntervalSeconds: (cloudSyncIntervalSeconds) => set({ cloudSyncIntervalSeconds }),
    }),
    {
      name: 'protest-settings-storage',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
