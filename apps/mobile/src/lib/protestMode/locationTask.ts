import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { recordLocationPoint, ensureActiveSession } from '../watermelon/protestSessions';
import { pushPendingLocationBatch } from '../../hooks/sync/useProtestDataSync';
import { useProtestSettingsStore } from '../../stores/useProtestSettingsStore';
import { logger } from '../../logger';

export const LOCATION_TASK_NAME = 'protest-mode-location-task';

// Set reactively by `useProtestLocationTracking` whenever the signed-in
// user changes - this task is registered once at module load and invoked
// by native code outside React (including while backgrounded), so it has
// no other way to know who's currently signed in, which it needs to
// resolve the right account's DEK for encryption.
let activeUserId: string | null = null;
export const setLocationTaskUser = (userId: string | null) => {
  activeUserId = userId;
};

let lastFlushAt = 0;

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    logger.error('protest location task error', { error });
    return;
  }
  if (!activeUserId) {
    return;
  }

  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  if (!locations?.length) {
    return;
  }

  const session = await ensureActiveSession();
  for (const location of locations) {
    await recordLocationPoint(session.id, location.coords.latitude, location.coords.longitude);
  }

  // Piggybacks the flush check on this already-firing background
  // callback instead of a separate timer - background JS timers aren't
  // reliable, this callback firing on every location update is.
  const saveIntervalMs = useProtestSettingsStore.getState().gpsSaveIntervalSeconds * 1000;
  const now = Date.now();
  if (now - lastFlushAt >= saveIntervalMs) {
    lastFlushAt = now;
    await pushPendingLocationBatch(activeUserId, session.id);
  }
});
