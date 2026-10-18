import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { zustandStorage } from './storage';

// Pure device-behavior knobs (how often *this* device samples/flushes) -
// unlike recoveryDelaySeconds these gate no server logic, so they're
// local-only settings, not `/me` fields: no server sync needed.
// `gpsRecordingEnabled` is deliberately sticky (MMKV persistence already
// gives us that for free) - the next protest-mode activation resumes
// whatever it was last left at.
interface ProtestSettingsStore {
  gpsRecordingEnabled: boolean;
  setGpsRecordingEnabled: (enabled: boolean) => void;

  gpsPollingIntervalSeconds: number;
  setGpsPollingIntervalSeconds: (seconds: number) => void;

  gpsSaveIntervalSeconds: number;
  setGpsSaveIntervalSeconds: (seconds: number) => void;
}

export const useProtestSettingsStore = create<ProtestSettingsStore>()(
  persist(
    (set) => ({
      gpsRecordingEnabled: true,
      setGpsRecordingEnabled: (enabled) => set({ gpsRecordingEnabled: enabled }),

      gpsPollingIntervalSeconds: 30,
      setGpsPollingIntervalSeconds: (seconds) => set({ gpsPollingIntervalSeconds: seconds }),

      gpsSaveIntervalSeconds: 300,
      setGpsSaveIntervalSeconds: (seconds) => set({ gpsSaveIntervalSeconds: seconds }),
    }),
    {
      name: 'protest-settings-storage',
      storage: createJSONStorage(() => zustandStorage),
    },
  ),
);
