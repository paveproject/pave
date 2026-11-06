import { startOfflineExecutor } from '@tanstack/offline-transactions/react-native';
import { createCollection, localOnlyCollectionOptions } from '@tanstack/db';
import { upsertSession, uploadBlob, endSession, listSessions } from '@libs/api-js';
import { Q } from '@nozbe/watermelondb';
import { File, Paths } from 'expo-file-system';
import { createOfflineTransactionsStorage } from './mmkvStorageAdapter';
import { throwForFailedResponse } from './classifyError';
import { database } from '../../../lib/watermelon/database';
import { ProtestSession } from '../../../lib/watermelon/models/ProtestSession';
import { ProtestPosition } from '../../../lib/watermelon/models/ProtestPosition';
import { PROTEST_POSITION_TABLE, PROTEST_SESSION_TABLE } from '../../../lib/watermelon/schema';
import { encryptBlob, openSessionKey } from '../../../lib/protestMode/crypto';
import { getProtestSessionKey } from '../../../lib/protestMode/keyStore';
import { logger } from '../../../logger';

/** See `reportMutationMarkers` for why an executor cannot work without one
 * real pending mutation to commit. */
export const protestMutationMarkers = createCollection(
  localOnlyCollectionOptions<{ id: string }>({
    getKey: (item) => item.id,
  }),
);

/**
 * Carried in the transaction so a replay off the on-disk outbox can redo the
 * work with no surviving closure - `userId` included, since the executor runs
 * outside the component tree and still has to reach a SecureStore key.
 */
interface ProtestPushBase {
  userId: string;
  sessionId: string;
  /** Resent with every push so a batch can re-create its own session. */
  sealedKey: string;
  metadata: string;
}

export interface PushSessionMetadata extends ProtestPushBase {
  /** Set once the session is closed; `pushSession` then also PATCHes it. */
  ended: boolean;
}

export interface PushPositionBatchMetadata extends ProtestPushBase {
  blobId: string;
  seq: number;
  positionIds: string[];
}

const sessions = () => database.get<ProtestSession>(PROTEST_SESSION_TABLE);
const positions = () => database.get<ProtestPosition>(PROTEST_POSITION_TABLE);

/**
 * Create-or-get, called by *both* mutation functions: nothing orders two
 * independently queued transactions, so an upload whose `pushSession` has not
 * landed yet would be rejected by the FK. Self-sufficient uploads remove the
 * ordering assumption.
 */
const ensureServerSession = async (meta: ProtestPushBase): Promise<void> => {
  const attempt = () =>
    upsertSession({
      path: { id: meta.sessionId },
      body: { sealedKey: meta.sealedKey, metadata: meta.metadata },
    });

  let { error, response } = await attempt();

  // A 409 means another session is still open on this account, usually one
  // whose close never reached the server. Left alone every later session 409s
  // forever, so heal it in the retry path rather than trusting the UI to have
  // cleaned up at the right moment.
  if (response?.status === 409) {
    logger.debug('protest: 409 on session push, closing the conflicting session', {
      sessionId: meta.sessionId,
    });
    await closeOtherActiveSessions(meta.sessionId);
    ({ error, response } = await attempt());
  }

  if (error) {
    // `throwForFailedResponse` only reads the status, discarding the client's
    // error object - the only thing that says why a request got no response.
    describeFailure('upsertSession', meta.sessionId, error, response);
    throwForFailedResponse(response?.status, 'protest session push');
  }
};

/** Flattened into one log line: `error` is often a plain object or a thrown
 * value, not an Error. */
const describeFailure = (
  call: string,
  sessionId: string,
  error: unknown,
  response: Response | undefined,
): void => {
  logger.error('protest: request failed', {
    call,
    sessionId,
    status: response?.status ?? null,
    url: response?.url ?? null,
    errorName: error instanceof Error ? error.name : typeof error,
    errorMessage: error instanceof Error ? error.message : String(error),
    errorJson: (() => {
      try {
        return JSON.stringify(error);
      } catch {
        return '<unserializable>';
      }
    })(),
  });
};

/** Metadata is sent back untouched: this device may have no key for those
 * sessions and cannot rewrite what it cannot read. */
const closeOtherActiveSessions = async (exceptSessionId: string): Promise<void> => {
  const { data, error } = await listSessions();
  if (error || !data) return;

  for (const remote of data) {
    if (!remote.active || remote.id === exceptSessionId) continue;
    const { error: closeError } = await endSession({
      path: { id: remote.id },
      body: { metadata: remote.metadata },
    });
    if (closeError) {
      describeFailure('endSession', remote.id, closeError, undefined);
    }
  }
};

/** The local copy when this device recorded the session, otherwise unsealed
 * from the DEK - which is how a sibling device reads one back. */
const resolveSessionKey = async ({
  userId,
  sessionId,
  sealedKey,
}: ProtestPushBase): Promise<Uint8Array> =>
  (await getProtestSessionKey(userId, sessionId)) ?? openSessionKey(userId, sealedKey);

export const protestExecutor = startOfflineExecutor({
  collections: { protestMutationMarkers },
  // A namespace of its own: `clear()` calls `mmkv.clearAll()`, so sharing one
  // with `reports` would make either executor wipe the other's outbox.
  storage: createOfflineTransactionsStorage('protest'),
  // Forced "always leader", verbatim from `reportsExecutor`: a deliberate
  // neutralization of multi-tab coordination, not an unfinished stub.
  leaderElection: {
    requestLeadership: () => Promise.resolve(true),
    releaseLeadership: () => {},
    isLeader: () => true,
    onLeadershipChange: () => () => {},
  },
  mutationFns: {
    pushSession: async ({ transaction }) => {
      const meta = transaction.metadata as unknown as PushSessionMetadata;
      logger.debug('protest: pushSession called', {
        sessionId: meta.sessionId,
        ended: meta.ended,
      });

      await ensureServerSession(meta);

      if (meta.ended) {
        const { error, response } = await endSession({
          path: { id: meta.sessionId },
          body: { metadata: meta.metadata },
        });
        if (error) throwForFailedResponse(response?.status, 'protest session close');
      }

      protestMutationMarkers.utils.acceptMutations(transaction);

      // Inside the mutation function, so a replay off the outbox reaches it
      // too - the original call site is long gone by then.
      const row = await sessions().find(meta.sessionId);
      await database.write(() =>
        row.update((r) => {
          r.synced = true;
        }),
      );
      logger.debug('protest: session marked synced', { sessionId: meta.sessionId });
    },

    pushPositionBatch: async ({ transaction }) => {
      const meta = transaction.metadata as unknown as PushPositionBatchMetadata;
      logger.debug('protest: pushPositionBatch called', {
        sessionId: meta.sessionId,
        blobId: meta.blobId,
        points: meta.positionIds.length,
      });

      await ensureServerSession(meta);

      // Read back from the database rather than carried in the transaction:
      // the outbox holds ids only, so a replay encrypts what is still on disk
      // instead of a stale snapshot.
      const rows = await positions()
        .query(Q.where('id', Q.oneOf(meta.positionIds)))
        .fetch();
      if (rows.length === 0) {
        // An earlier attempt already landed and the rows were cleaned up.
        protestMutationMarkers.utils.acceptMutations(transaction);
        return;
      }

      const sessionKey = await resolveSessionKey(meta);
      const payload = new TextEncoder().encode(
        JSON.stringify(
          rows.map((row) => ({
            lat: row.lat,
            lng: row.lng,
            accuracy: row.accuracy,
            recordedAt: row.recordedAt.toISOString(),
          })),
        ),
      );
      const ciphertext = encryptBlob(sessionKey, payload);

      // Staged to a file because a `Uint8Array` cannot become a multipart
      // part directly: RN's `Blob` constructor throws on typed arrays
      // (`Libraries/Blob/BlobManager.js`). The part must then be the
      // `expo-file-system` `File` instance itself - a `{ uri, name, type }`
      // object, which RN's FormData docs show, does not go through this
      // generated client. Keeps the bytes raw either way.
      const staged = new File(Paths.cache, `protest-${meta.blobId}.bin`);
      try {
        staged.create({ overwrite: true, intermediates: true });
        // `write` is async, unlike `create` and `delete`. Not awaiting it
        // uploads a file that isn't on disk yet, which surfaces as a bare
        // "network error".
        await staged.write(ciphertext);

        // Before the request: a missing file makes the native layer fail with
        // no response at all, which also reads as "network error".
        if (!staged.exists) {
          throw new Error(`staged blob was not written to disk: ${staged.uri}`);
        }

        const form = new FormData();
        form.append('kind', 'position_batch');
        form.append('seq', String(meta.seq));
        // The `File` instance itself - see the staging comment above.
        form.append('file', staged as unknown as Blob);

        const { error, response } = await uploadBlob({
          path: { id: meta.sessionId, blob_id: meta.blobId },
          // Multipart isn't representable in the generated types - same
          // escape hatch as the avatar upload.
          body: form as never,
          bodySerializer: (value) => value,
        });
        if (error) {
          describeFailure('uploadBlob', meta.sessionId, error, response);
          throwForFailedResponse(response?.status, 'protest position batch');
        }
      } finally {
        // Ciphertext in the cache is still someone's trajectory.
        try {
          // Guarded: the upload can consume the file, and `delete` throws on
          // a missing path.
          if (staged.exists) staged.delete();
        } catch (cleanupError) {
          logger.error('protest: failed to clean up a staged blob', { cleanupError });
        }
      }

      protestMutationMarkers.utils.acceptMutations(transaction);

      await database.write(() =>
        database.batch(
          ...rows.map((row) =>
            row.prepareUpdate((r) => {
              r.synced = true;
            }),
          ),
        ),
      );
      logger.debug('protest: position batch marked synced', {
        sessionId: meta.sessionId,
        blobId: meta.blobId,
        points: rows.length,
      });
    },
  },
});
