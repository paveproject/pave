import { create } from 'zustand';

/**
 * This device's server-assigned id, in a store rather than read once from
 * SecureStore: at sign-up the read loses a race against the `PUT /me/devices`
 * that creates the id, and a screen mounted in that window used to keep
 * `null` for the whole session. Both the hydration and the registration write
 * here, whichever lands first.
 *
 * Keyed by `userId` so a previous user's id can't leak out after a sign-out -
 * consumers compare before reading.
 */
interface DeviceIdState {
  userId: string | null;
  deviceId: string | null;
  setDeviceId: (userId: string, deviceId: string) => void;
  clear: () => void;
}

export const useDeviceIdStore = create<DeviceIdState>((set) => ({
  userId: null,
  deviceId: null,
  setDeviceId: (userId, deviceId) => set({ userId, deviceId }),
  clear: () => set({ userId: null, deviceId: null }),
}));
