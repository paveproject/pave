import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../providers/AuthProvider';
import { usePermissions } from '../../providers/PermissionsProvider';
import { useProtestSettingsStore } from '../../stores/useProtestSettingsStore';
import { useObservable } from '../useObservable';
import {
  endActiveSession,
  observeActiveSession,
  observeUnsyncedPositionCount,
  startSession,
} from '../../lib/watermelon/protestSessions';
import {
  isLocationRecordingActive,
  startLocationRecording,
  stopLocationRecording,
} from '../../lib/protestMode/locationTask';
import type { ProtestSession } from '../../lib/watermelon/models/ProtestSession';
import { MissingDekError } from '../../lib/protestMode/crypto';
import { logger } from '../../logger';

export type StartFailure =
  | 'not-signed-in'
  | 'no-permission'
  /** No DEK on this device to seal a session key with - the recovery phrase
   * has to be entered here once. Its own case because only the user can fix
   * it. */
  | 'no-dek'
  /** Another session is still open server-side and could not be closed. */
  | 'session-conflict'
  | 'error';

/**
 * The one place the protest-mode screens talk to. Owns the sequencing, which
 * matters in both directions:
 *
 *   start → permission → local session row → OS location updates
 *   stop  → OS location updates (with a final flush) → close the session
 *
 * Recording before the row exists produces positions with nowhere to belong;
 * closing the session first lets a fix land on a closed one.
 */
export const useProtestSession = () => {
  const { user } = useAuth();
  const userId = user?.id;
  const { backgroundLocation } = usePermissions();
  const { gpsEnabled, gpsIntervalSeconds, cloudSyncIntervalSeconds } = useProtestSettingsStore();

  const getActive = useCallback(() => observeActiveSession(), []);
  const activeSessions = useObservable<ProtestSession[]>(getActive, []);
  const session = activeSessions[0] ?? null;

  // Per stream: the UI reports them separately, and audio adds its own.
  const getPendingPositions = useCallback(() => observeUnsyncedPositionCount(), []);
  const pendingPositions = useObservable<number>(getPendingPositions, 0);

  const [isBusy, setIsBusy] = useState(false);
  const [recording, setRecording] = useState(false);

  // The OS keeps the task running across a kill, so this has to come from
  // TaskManager, not from state this tree remembers.
  useEffect(() => {
    isLocationRecordingActive().then(setRecording);
  }, [session?.id]);

  const start = useCallback(async (): Promise<StartFailure | null> => {
    if (!userId) return 'not-signed-in';
    setIsBusy(true);
    try {
      // A session with GPS off has no reason to ask for "Always" location.
      if (gpsEnabled && backgroundLocation.status !== 'granted') {
        const granted = await backgroundLocation.request();
        if (!granted) return 'no-permission';
      }

      const started = await startSession(userId);

      if (gpsEnabled) {
        await startLocationRecording({
          userId,
          sessionId: started.id,
          gpsIntervalSeconds,
          cloudSyncIntervalSeconds,
        });
        setRecording(true);
      }
      return null;
    } catch (error) {
      if (error instanceof MissingDekError) {
        logger.error('protest: no DEK on this device, cannot start a session', { error });
        return 'no-dek';
      }
      logger.error('protest: failed to start a session', { error });
      return 'error';
    } finally {
      setIsBusy(false);
    }
  }, [userId, gpsEnabled, gpsIntervalSeconds, cloudSyncIntervalSeconds, backgroundLocation]);

  const stop = useCallback(async (): Promise<boolean> => {
    if (!userId) return false;
    setIsBusy(true);
    try {
      // Detached first, and it flushes on the way out, so the tail is queued
      // before the session is marked closed.
      await stopLocationRecording();
      setRecording(false);
      await endActiveSession(userId);
      return true;
    } catch (error) {
      logger.error('protest: failed to stop a session', { error });
      return false;
    } finally {
      setIsBusy(false);
    }
  }, [userId]);

  /** Re-arms a running session on a settings change: the new GPS interval
   * would otherwise do nothing until the next session. */
  useEffect(() => {
    if (!userId || !session || !gpsEnabled) return;
    startLocationRecording({
      userId,
      sessionId: session.id,
      gpsIntervalSeconds,
      cloudSyncIntervalSeconds,
    }).catch((error) => logger.error('protest: failed to re-arm location updates', { error }));
  }, [userId, session, gpsEnabled, gpsIntervalSeconds, cloudSyncIntervalSeconds]);

  /** Turning GPS off mid-session leaves the session open - it can still hold
   * other evidence. */
  useEffect(() => {
    if (session && !gpsEnabled) {
      stopLocationRecording()
        .then(() => setRecording(false))
        .catch((error) => logger.error('protest: failed to stop location updates', { error }));
    }
  }, [session, gpsEnabled]);

  return useMemo(
    () => ({ session, isActive: !!session, recording, pendingPositions, isBusy, start, stop }),
    [session, recording, pendingPositions, isBusy, start, stop],
  );
};
