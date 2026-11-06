import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { flushPositions, recordPosition } from '../watermelon/protestSessions';
import { logger } from '../../logger';

/**
 * Background trajectory recording. Defined at module scope, and the active
 * session kept in module state, because `TaskManager` requires registration
 * before the bundle finishes evaluating: the OS can relaunch the app straight
 * into this callback with no React tree mounted.
 */
const LOCATION_TASK_NAME = 'protest-mode-location-task';

interface ActiveRecording {
  userId: string;
  sessionId: string;
  /** Minimum gap between two uploads. */
  cloudSyncIntervalMs: number;
}

let active: ActiveRecording | null = null;
let lastFlushAt = 0;

const setActiveRecording = (recording: ActiveRecording | null): void => {
  active = recording;
  // Reset so a new session doesn't inherit the previous one's clock.
  lastFlushAt = 0;
};

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    logger.error('protest: location task error', { error });
    return;
  }
  // Normal: the OS keeps delivering briefly after `stop()`, and can relaunch
  // the app into this callback before anything hands over a session.
  if (!active) return;

  const { locations } = (data ?? {}) as { locations?: Location.LocationObject[] };
  if (!locations?.length) return;

  const { userId, sessionId, cloudSyncIntervalMs } = active;

  try {
    for (const location of locations) {
      await recordPosition({
        sessionId,
        lat: location.coords.latitude,
        lng: location.coords.longitude,
        accuracy: location.coords.accuracy ?? null,
        recordedAt: new Date(location.timestamp),
      });
    }

    // Driven off this callback rather than a timer: background JS timers are
    // unreliable on both platforms, so the interval is enforced by comparing
    // clocks instead of by scheduling.
    const now = Date.now();
    if (now - lastFlushAt >= cloudSyncIntervalMs) {
      lastFlushAt = now;
      await flushPositions(userId, sessionId);
    }
  } catch (taskError) {
    // Never throw out of a task callback: the OS can stop delivering updates
    // for the rest of the session.
    logger.error('protest: failed to handle a location update', { taskError });
  }
});

/** Idempotent: `expo-location` throws if the task is already registered, so
 * an existing registration is replaced rather than added to. */
export const startLocationRecording = async (params: {
  userId: string;
  sessionId: string;
  gpsIntervalSeconds: number;
  cloudSyncIntervalSeconds: number;
}): Promise<void> => {
  setActiveRecording({
    userId: params.userId,
    sessionId: params.sessionId,
    cloudSyncIntervalMs: params.cloudSyncIntervalSeconds * 1000,
  });

  if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: params.gpsIntervalSeconds * 1000,
    // Deliberate: someone recording a protest should see at a glance that
    // their phone is recording. Android also needs the notification for its
    // foreground service.
    showsBackgroundLocationIndicator: true,
    pausesUpdatesAutomatically: false,
    foregroundService: {
      notificationTitle: 'Protest mode',
      notificationBody: 'Recording your trajectory',
      killServiceOnDestroy: false,
    },
  });
  logger.debug('protest: location recording started', {
    sessionId: params.sessionId,
    intervalSeconds: params.gpsIntervalSeconds,
  });
};

export const stopLocationRecording = async (): Promise<void> => {
  const wasActive = active;
  setActiveRecording(null);

  if (await TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME)) {
    await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
  }

  // After detaching, so the tail of the recording isn't left behind.
  if (wasActive) {
    await flushPositions(wasActive.userId, wasActive.sessionId).catch((error) =>
      logger.error('protest: final flush after stopping failed', { error }),
    );
  }
  logger.debug('protest: location recording stopped');
};

/** The source of truth for the UI: a kill-and-relaunch can leave the task
 * running with no React state remembering it. */
export const isLocationRecordingActive = (): Promise<boolean> =>
  TaskManager.isTaskRegisteredAsync(LOCATION_TASK_NAME);
