import { Q } from '@nozbe/watermelondb';
import { database } from './database';
import { ProtestSession } from './models/ProtestSession';
import { LocationPoint } from './models/LocationPoint';
import { PROTEST_SESSION_TABLE, LOCATION_POINT_TABLE } from './schema';

const sessions = () => database.get<ProtestSession>(PROTEST_SESSION_TABLE);
const points = () => database.get<LocationPoint>(LOCATION_POINT_TABLE);

/**
 * Returns the currently-open session (no `endedAt` yet), creating one
 * locally first if none is open - sessions are opened lazily, on the
 * first thing actually recorded (a location point or an audio segment),
 * not eagerly when protest mode itself turns on, so toggling protest mode
 * without ever recording anything doesn't leave empty sessions behind.
 * Pushed to the API separately (see `hooks/sync/useProtestDataSync.ts`) -
 * `synced` tracks that, exactly like `reports.ts`.
 */
export const ensureActiveSession = async (): Promise<ProtestSession> => {
  const open = await sessions().query(Q.where('ended_at', null)).fetch();
  if (open.length > 0) {
    return open[0];
  }
  return database.write(() =>
    sessions().create((s) => {
      s.startedAt = new Date();
      s.endedAt = null;
      s.synced = false;
    }),
  );
};

/** No-op if no session is currently open. */
export const endActiveSession = async (): Promise<void> => {
  const open = await sessions().query(Q.where('ended_at', null)).fetch();
  await database.write(async () => {
    await Promise.all(
      open.map((session) =>
        session.update((s) => {
          s.endedAt = new Date();
          s.synced = false;
        }),
      ),
    );
  });
};

export const recordLocationPoint = async (
  sessionId: string,
  lat: number,
  lng: number,
): Promise<void> => {
  await database.write(() =>
    points().create((p) => {
      p.sessionId = sessionId;
      p.lat = lat;
      p.lng = lng;
      p.recordedAt = new Date();
      p.synced = false;
    }),
  );
};

export const getUnsyncedSessions = (): Promise<ProtestSession[]> =>
  sessions().query(Q.where('synced', false)).fetch();

export const getUnsyncedPointsForSession = (sessionId: string): Promise<LocationPoint[]> =>
  points().query(Q.where('session_id', sessionId), Q.where('synced', false)).fetch();

export const markPointsSynced = async (pointsToMark: LocationPoint[]): Promise<void> => {
  await database.write(async () => {
    await Promise.all(
      pointsToMark.map((p) =>
        p.update((row) => {
          row.synced = true;
        }),
      ),
    );
  });
};
