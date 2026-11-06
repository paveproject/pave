import { Q } from '@nozbe/watermelondb';
import { randomUUID } from 'expo-crypto';
import { listSessions, endSession } from '@libs/api-js';
import { database } from './database';
import { ProtestSession } from './models/ProtestSession';
import { ProtestPosition } from './models/ProtestPosition';
import { PROTEST_POSITION_TABLE, PROTEST_SESSION_TABLE } from './schema';
import {
  protestExecutor,
  protestMutationMarkers,
  type PushPositionBatchMetadata,
  type PushSessionMetadata,
} from '../../providers/sync/offlineExecutor/protestExecutor';
import { useSyncLogStore } from '../../providers/sync/syncLogStore';
import { SYNC_TASK_IDS } from '../../providers/sync/types';
import {
  mintSessionKey,
  resealSessionKeys,
  sealMetadata,
  sealSessionKey,
} from '../protestMode/crypto';
import { getProtestSessionKey, setProtestSessionKey } from '../protestMode/keyStore';
import { logger } from '../../logger';

/**
 * Local side of protest-mode sessions, same shape as `reports.ts`. Unlike a
 * report, a session's data keeps arriving while it is open, so it uploads in
 * batches *during* the session: that is the protection, a phone seized
 * mid-session has already sent what it recorded.
 */

const sessions = () => database.get<ProtestSession>(PROTEST_SESSION_TABLE);
const positions = () => database.get<ProtestPosition>(PROTEST_POSITION_TABLE);

/** Contents of the session's encrypted `metadata` column. */
interface SessionEnvelope {
  startedAt: string;
  endedAt: string | null;
}

/** Sealed under the session key, not the DEK - that is what makes it survive
 * a DEK rotation. */
const sealEnvelope = async (
  userId: string,
  session: ProtestSession,
  endedAt: Date | null,
): Promise<string> => {
  const key = await getProtestSessionKey(userId, session.id);
  if (!key) throw new Error(`no local key for protest session ${session.id}`);
  return sealMetadata(key, {
    startedAt: session.startedAt.toISOString(),
    endedAt: endedAt?.toISOString() ?? null,
  } satisfies SessionEnvelope);
};

export const observeActiveSession = () => sessions().query(Q.where('ended_at', null)).observe();

export const observeSessions = () => sessions().query(Q.sortBy('started_at', Q.desc)).observe();

export const observeSessionCounts = (sessionId: string) => ({
  total: positions().query(Q.where('session_id', sessionId)).observeCount(),
  synced: positions()
    .query(Q.where('session_id', sessionId), Q.where('synced', true))
    .observeCount(),
});

export const observePositions = (sessionId: string) =>
  positions().query(Q.where('session_id', sessionId)).observe();

const getActiveSession = async (): Promise<ProtestSession | null> => {
  const [active] = await sessions().query(Q.where('ended_at', null)).fetch();
  return active ?? null;
};

export const startSession = async (userId: string): Promise<ProtestSession> => {
  const existing = await getActiveSession();
  if (existing) return existing;

  // A session left open server-side with nothing local pointing at it makes
  // every future start fail with a permanent 409, with no way out of the UI.
  await closeOrphanedServerSessions();

  const sessionId = randomUUID();
  const key = mintSessionKey();
  const startedAt = new Date();
  const sealedKey = await sealSessionKey(userId, key);
  const metadata = sealMetadata(key, {
    startedAt: startedAt.toISOString(),
    endedAt: null,
  } satisfies SessionEnvelope);

  // Before the row: a row whose key was never stored can never be read.
  await setProtestSessionKey(userId, sessionId, key);

  const session = await database.write(() =>
    sessions().create((s) => {
      s._raw.id = sessionId;
      s.startedAt = startedAt;
      s.endedAt = null;
      s.sealedKey = sealedKey;
      s.nextSeq = 0;
      s.synced = false;
    }),
  );
  logger.debug('protest: session started', { sessionId });

  await enqueueSessionPush(userId, session, metadata, false);
  return session;
};

/** Best-effort: offline there is nothing to reconcile and the start proceeds,
 * the push simply sits in the outbox. */
const closeOrphanedServerSessions = async (): Promise<void> => {
  const { data, error } = await listSessions();
  if (error || !data) return;

  // "Not open on this device", not "absent from it": a session already closed
  // locally whose close push never landed still blocks every future start.
  const openLocally = new Set(
    (await sessions().query(Q.where('ended_at', null)).fetch()).map((row) => row.id),
  );
  for (const remote of data) {
    if (!remote.active || openLocally.has(remote.id)) continue;
    logger.debug('protest: closing an orphaned server session', { sessionId: remote.id });
    // Metadata re-sent untouched: this device can no longer open it.
    await endSession({ path: { id: remote.id }, body: { metadata: remote.metadata } });
  }
};

/** Flushes before closing, so the tail of the recording isn't left behind. */
export const endActiveSession = async (userId: string): Promise<void> => {
  const session = await getActiveSession();
  if (!session) return;

  await flushPositions(userId, session.id);

  const endedAt = new Date();
  const metadata = await sealEnvelope(userId, session, endedAt);

  await database.write(() =>
    session.update((s) => {
      s.endedAt = endedAt;
      s.synced = false;
    }),
  );
  logger.debug('protest: session ended', { sessionId: session.id });

  await enqueueSessionPush(userId, session, metadata, true);
};

export const recordPosition = async (params: {
  sessionId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  recordedAt: Date;
}): Promise<void> => {
  await database.write(() =>
    positions().create((p) => {
      p.sessionId = params.sessionId;
      p.lat = params.lat;
      p.lng = params.lng;
      p.accuracy = params.accuracy;
      p.recordedAt = params.recordedAt;
      p.synced = false;
    }),
  );
};

/**
 * Queues every unsynced position of a session as one encrypted batch.
 *
 * `nextSeq` is consumed and persisted immediately: two concurrent flushes
 * claiming the same number would earn a 409 the outbox treats as permanent.
 */
export const flushPositions = async (userId: string, sessionId: string): Promise<void> => {
  await protestExecutor.waitForInit();
  const session = await sessions().find(sessionId);
  const unsynced = await positions()
    .query(Q.where('session_id', sessionId), Q.where('synced', false))
    .fetch();

  // Positions stay `synced: false` until their batch lands, so an unfiltered
  // "everything unsynced" query re-batches what is still in flight - each
  // flush then queues a blob containing every earlier point, without bound.
  const alreadyQueued = new Set(
    (await protestExecutor.peekOutbox())
      .filter((entry) => entry.mutationFnName === 'pushPositionBatch')
      .flatMap(
        (entry) =>
          (entry.metadata as unknown as PushPositionBatchMetadata | undefined)?.positionIds ?? [],
      ),
  );
  const pending = unsynced.filter((row) => !alreadyQueued.has(row.id));
  if (pending.length === 0) return;

  const seq = session.nextSeq;
  await database.write(() =>
    session.update((s) => {
      s.nextSeq = seq + 1;
    }),
  );

  const metadata = await sealEnvelope(userId, session, session.endedAt);

  await enqueueBatchPush({
    userId,
    sessionId,
    sealedKey: session.sealedKey,
    metadata,
    blobId: randomUUID(),
    seq,
    positionIds: pending.map((row) => row.id),
  });
};

const logLine = (status: 'syncing' | 'idle' | 'error', message: string) =>
  useSyncLogStore.getState().append({ taskId: SYNC_TASK_IDS.protest, status, message });

/** See `reports.ts`'s `enqueuePush` for why `autoCommit: false`, a real
 * `.mutate()` body and an un-awaited `commit()` are all load-bearing. */
const enqueue = async (
  mutationFnName: 'pushSession' | 'pushPositionBatch',
  idempotencyKey: string,
  metadata: PushSessionMetadata | PushPositionBatchMetadata,
  label: string,
): Promise<void> => {
  await protestExecutor.waitForInit();

  // Re-enqueueing an entry the executor is already retrying throws
  // `DuplicateKeyError` on the marker insert below: a marker is released only
  // by a successful `acceptMutations`, so anything that failed once would
  // throw here forever and wedge the queue.
  const outbox = await protestExecutor.peekOutbox();
  if (outbox.some((entry) => entry.idempotencyKey === idempotencyKey)) {
    logger.debug('protest: already queued, not re-enqueueing', { idempotencyKey });
    return;
  }

  const transaction = protestExecutor.createOfflineTransaction({
    mutationFnName,
    autoCommit: false,
    idempotencyKey,
    metadata: metadata as unknown as Record<string, unknown>,
  });
  transaction.mutate(() => {
    protestMutationMarkers.insert({ id: idempotencyKey });
  });

  logLine('syncing', `${label}: push attempt started`);

  transaction.commit().then(
    () => {
      logger.debug('protest: push succeeded', { mutationFnName, idempotencyKey });
      logLine('idle', `${label}: pushed successfully`);
    },
    (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      logger.error('protest push failed permanently', { mutationFnName, idempotencyKey, error });
      logLine('error', `${label}: ${message}`);
    },
  );
};

const enqueueSessionPush = (
  userId: string,
  session: ProtestSession,
  metadata: string,
  ended: boolean,
): Promise<void> =>
  enqueue(
    'pushSession',
    // Distinct keys for open and closed: one shared key makes the second push
    // a no-op.
    `${session.id}:${ended ? 'end' : 'start'}`,
    { userId, sessionId: session.id, sealedKey: session.sealedKey, metadata, ended },
    `session ${session.id.slice(0, 8)}…${ended ? ' (closing)' : ''}`,
  );

const enqueueBatchPush = (metadata: PushPositionBatchMetadata): Promise<void> =>
  enqueue(
    'pushPositionBatch',
    metadata.blobId,
    metadata,
    `batch ${metadata.blobId.slice(0, 8)}… (${metadata.positionIds.length} points)`,
  );

/**
 * Re-seals every session key under the DEK currently in storage, and pushes
 * the new envelopes. Call it right after a rotation, with the DEK it
 * replaced: removing a trusted contact mints a brand-new DEK, which leaves
 * every stored `sealed_key` unopenable. Skipping it loses the whole history,
 * silently. Best-effort per session, so one bad envelope doesn't cost the
 * others.
 */
export const resealProtestSessions = async (
  userId: string,
  previousDek: Uint8Array,
): Promise<void> => {
  const rows = await sessions().query().fetch();
  if (rows.length === 0) return;

  const sealedById = Object.fromEntries(rows.map((row) => [row.id, row.sealedKey]));

  let resealed: Record<string, string>;
  try {
    resealed = await resealSessionKeys(userId, previousDek, sealedById);
  } catch (error) {
    logger.error('protest: could not reseal session keys after a DEK rotation', {
      error,
      sessions: rows.length,
    });
    return;
  }

  for (const row of rows) {
    const next = resealed[row.id];
    if (!next) continue;
    await database.write(() =>
      row.update((r) => {
        r.sealedKey = next;
        // Forces the push: the server still holds the old envelope.
        r.synced = false;
      }),
    );
    const metadata = await sealEnvelope(userId, row, row.endedAt);
    await enqueueSessionPush(userId, row, metadata, row.endedAt !== null);
  }

  logger.debug('protest: resealed session keys after a DEK rotation', {
    sessions: rows.length,
  });
};

export const getUnsyncedProtestCount = async (): Promise<number> =>
  positions().query(Q.where('synced', false)).fetchCount();

export const observeUnsyncedPositionCount = () =>
  positions().query(Q.where('synced', false)).observeCount();

/** Startup catch-up for the case where the app died between a local write and
 * its outbox entry. Both endpoints are idempotent on their client-minted ids,
 * so re-queueing something already in flight is harmless. */
export const reconcileUnsyncedProtestData = async (userId: string): Promise<void> => {
  const stale = await sessions().query(Q.where('synced', false)).fetch();
  for (const session of stale) {
    const metadata = await sealEnvelope(userId, session, session.endedAt);
    await enqueueSessionPush(userId, session, metadata, session.endedAt !== null);
  }

  const sessionIds = new Set(
    (await positions().query(Q.where('synced', false)).fetch()).map((row) => row.sessionId),
  );
  for (const sessionId of sessionIds) {
    await flushPositions(userId, sessionId);
  }
};

/** Bounded, so signing out never hangs on a stuck outbox. */
const DRAIN_TIMEOUT_MS = 8000;

const waitForOutboxToDrain = async (): Promise<boolean> => {
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (protestExecutor.getPendingCount() + protestExecutor.getRunningCount() === 0) return true;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  return false;
};

/**
 * Logout path. Signing out has to destroy the rows - `lat`/`lng` are
 * plaintext, so leaving them hands the next account someone else's
 * trajectory - but destroying un-uploaded evidence without trying to send it
 * is the failure this feature exists to prevent. So: queue, wait a bounded
 * moment, clear regardless. Offline that loses the data, which is what the
 * pre-logout warning says.
 */
export const flushAndClearProtestData = async (userId: string | undefined): Promise<void> => {
  if (userId && protestExecutor.isOnline()) {
    try {
      await reconcileUnsyncedProtestData(userId);
      const drained = await waitForOutboxToDrain();
      if (!drained) {
        logger.warn('protest: outbox still had work at logout, data will be dropped', {
          pending: protestExecutor.getPendingCount(),
          running: protestExecutor.getRunningCount(),
        });
      }
    } catch (error) {
      // Best effort only - a failure here must never block signing out.
      logger.error('protest: final flush before logout failed', { error });
    }
  }
  await clearLocalProtestData();
};

/** Outbox before rows, so a replay can't resurrect what is about to vanish.
 * Destroys unconditionally - prefer `flushAndClearProtestData` on logout. */
export const clearLocalProtestData = async (): Promise<void> => {
  await protestExecutor.clearOutbox();
  const [allSessions, allPositions] = await Promise.all([
    sessions().query().fetch(),
    positions().query().fetch(),
  ]);
  await database.write(() =>
    database.batch(
      ...allPositions.map((row) => row.prepareDestroyPermanently()),
      ...allSessions.map((row) => row.prepareDestroyPermanently()),
    ),
  );
};
