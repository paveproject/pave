import { useEffect } from 'react';
import * as Location from 'expo-location';
import { useAuth } from '../../providers/AuthProvider';
import { useProtestMode } from '../useProtestMode';
import { useProtestSettingsStore } from '../../stores/useProtestSettingsStore';
import { ensureActiveSession, endActiveSession } from '../../lib/watermelon/protestSessions';
import { LOCATION_TASK_NAME, setLocationTaskUser } from '../../lib/protestMode/locationTask';
import { logger } from '../../logger';

/**
 * Mounted once, gated `!!user` (see `providers/Providers.tsx`). Starts/
 * stops background location tracking reactively on both `enabled`
 * (protest mode itself) and `gpsRecordingEnabled` (the sticky local
 * setting, see `useProtestSettingsStore`) - either one going false stops
 * tracking, both true starts it. That's what makes "toggle GPS recording
 * on/off mid-session" actually work, instead of only being checked once
 * at activation time.
 */
export const useProtestLocationTracking = () => {
  const { user } = useAuth();
  const { enabled } = useProtestMode();
  const gpsRecordingEnabled = useProtestSettingsStore((s) => s.gpsRecordingEnabled);
  const gpsPollingIntervalSeconds = useProtestSettingsStore((s) => s.gpsPollingIntervalSeconds);

  useEffect(() => {
    setLocationTaskUser(user?.id ?? null);
  }, [user?.id]);

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;

    (async () => {
      // Always stop first and reconsider from scratch - simplest way to
      // handle a polling-interval change while already tracking without
      // ending up with two overlapping subscriptions.
      const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
      if (started) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
      if (cancelled) {
        return;
      }

      if (!enabled) {
        await endActiveSession();
        return;
      }
      if (!gpsRecordingEnabled) {
        return;
      }

      const permission = await Location.requestBackgroundPermissionsAsync();
      if (permission.status !== 'granted') {
        logger.error(
          'background location permission denied - protest-mode position recording unavailable',
        );
        return;
      }

      await ensureActiveSession();
      await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: gpsPollingIntervalSeconds * 1000,
        showsBackgroundLocationIndicator: true,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user, enabled, gpsRecordingEnabled, gpsPollingIntervalSeconds]);
};
