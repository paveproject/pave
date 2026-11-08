import { startOfflineExecutor } from '@tanstack/offline-transactions/react-native';
import { createCollection, localOnlyCollectionOptions } from '@tanstack/db';
import { upsertSession, endSession, listSessions } from '@libs/api-js';
import { Q } from '@nozbe/watermelondb';
import { File, Paths, UploadType } from 'expo-file-system';
import { createOfflineTransactionsStorage } from './mmkvStorageAdapter';
import { throwForFailedResponse } from './classifyError';
import { database } from '../../../lib/watermelon/database';
import { ProtestSession } from '../../../lib/watermelon/models/ProtestSession';
import { ProtestPosition } from '../../../lib/watermelon/models/ProtestPosition';
import {
  ProtestMediaChunk,
  type MediaChunkKind,
} from '../../../lib/watermelon/models/ProtestMediaChunk';
import {
  PROTEST_MEDIA_CHUNK_TABLE,
  PROTEST_POSITION_TABLE,
  PROTEST_SESSION_TABLE,
} from '../../../lib/watermelon/schema';
import { encryptBlob, openSessionKey } from '../../../lib/protestMode/crypto';
import { API_ENDPOINT } from '../../../env/common';
import { getSessionToken } from '../../../lib/auth/session';
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

export interface PushMediaChunkMetadata extends ProtestPushBase {
  blobId: string;
  kind: MediaChunkKind;
  seq: number;
  chunkId: string;
}

const sessions = () => database.get<ProtestSession>(PROTEST_SESSION_TABLE);
const positions = () => database.get<ProtestPosition>(PROTEST_POSITION_TABLE);
const audioChunks = () => database.get<ProtestMediaChunk>(PROTEST_MEDIA_CHUNK_TABLE);

/**
 * Create-or-get, called by *both* mutation functions: nothing orders two
 * independently queued transactions, so an upload whose `pushSession` has not
 * landed yet would be rejected by the FK. Self-sufficient uploads remove the
 * ordering assumption.
 */
const ensureServerSession = async (meta: ProtestPushBase): Promise<void> => {
  const attempt = () =>
    upsertSession({
      path: { protest_session_id: meta.sessionId },
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
    await closeOtherActiveSessions(meta.userId, meta.sessionId);
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
const closeOtherActiveSessions = async (userId: string, exceptSessionId: string): Promise<void> => {
  const { data, error } = await listSessions({ path: { user_id: userId } });
  if (error || !data) return;

  for (const remote of data) {
    if (!remote.active || remote.id === exceptSessionId) continue;
    const { error: closeError } = await endSession({
      path: { protest_session_id: remote.id },
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

type BlobKind = 'position_batch' | 'audio_chunk' | 'video_chunk';

/**
 * Uploads one already-sealed file.
 *
 * `File.upload` rather than the generated client: it hands the transfer to a
 * background `NSURLSession` (`sessionType` defaults to `'background'`), so the
 * OS carries it on after the app is suspended - a `fetch` dies with the
 * process, which meant a clip sent as the phone went into a pocket only
 * resumed when the app was next opened. It also streams from disk instead of
 * loading the whole file into JS memory to build a `FormData`.
 *
 * If the app is *killed* mid-transfer the JS promise is not restored, so the
 * row stays unsynced and `reconcileUnsyncedProtestData` re-queues it. That is
 * safe only because `blobId` is minted with the row: `upload_blob` returns the
 * stored blob unchanged for an id it already holds, without even reading the
 * body.
 */
const uploadSealedFile = async (
  meta: { sessionId: string; blobId: string; seq: number },
  kind: BlobKind,
  file: File,
): Promise<void> => {
  // Before the request: a missing file makes the native layer fail with no
  // response at all, which reads as a bare "network error".
  if (!file.exists) throw new Error(`sealed blob is not on disk: ${file.uri}`);

  const token = await getSessionToken();
  if (!token) throw new Error('not signed in');

  const url = `${API_ENDPOINT}/protest-session/${meta.sessionId}/blob/${meta.blobId}`;
  let result;
  try {
    result = await file.upload(url, {
      httpMethod: 'PUT',
      uploadType: UploadType.MULTIPART,
      fieldName: 'file',
      mimeType: 'application/octet-stream',
      parameters: { kind, seq: String(meta.seq) },
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (error) {
    describeFailure('uploadBlob', meta.sessionId, error, undefined);
    throw error;
  }

  if (result.status < 200 || result.status >= 300) {
    describeFailure('uploadBlob', meta.sessionId, result.body, undefined);
    throwForFailedResponse(result.status, `protest ${kind}`);
  }
};

/** For a payload built in memory - only the position batches, which have no
 * file of their own. Media is already sealed on disk. */
const uploadCiphertext = async (
  meta: { sessionId: string; blobId: string; seq: number },
  kind: BlobKind,
  ciphertext: Uint8Array,
): Promise<void> => {
  const staged = new File(Paths.cache, `protest-${meta.blobId}.bin`);
  try {
    staged.create({ overwrite: true, intermediates: true });
    // `write` is async, unlike `create` and `delete`. Not awaiting it uploads
    // a file that isn't on disk yet.
    await staged.write(ciphertext);
    await uploadSealedFile(meta, kind, staged);
  } finally {
    // Ciphertext in the cache is still someone's recording.
    try {
      if (staged.exists) staged.delete();
    } catch (cleanupError) {
      logger.error('protest: failed to clean up a staged blob', { cleanupError });
    }
  }
};

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
          path: { protest_session_id: meta.sessionId },
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
      await uploadCiphertext(meta, 'position_batch', ciphertext);

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

    pushMediaChunk: async ({ transaction }) => {
      const meta = transaction.metadata as unknown as PushMediaChunkMetadata;
      logger.debug('protest: pushMediaChunk called', {
        sessionId: meta.sessionId,
        blobId: meta.blobId,
      });

      await ensureServerSession(meta);

      const row = await audioChunks()
        .find(meta.chunkId)
        .catch(() => null);
      if (!row || row.synced) {
        // An earlier attempt landed, or the row was cleaned up.
        protestMutationMarkers.utils.acceptMutations(transaction);
        return;
      }

      // Already ciphertext on disk - sealed when the recorder closed the
      // file, not here, so a seized phone holds no plaintext media for
      // whatever is still queued. The executor only moves bytes, and unlike
      // the position path it needs no session key at all.
      const chunk = new File(row.uri);
      if (!chunk.exists) {
        logger.error('protest: a media chunk is gone from disk, dropping it', {
          chunkId: meta.chunkId,
          uri: row.uri,
        });
        protestMutationMarkers.utils.acceptMutations(transaction);
        await database.write(() => row.destroyPermanently());
        return;
      }

      // Straight from the sealed file: reading it into memory first would
      // mean a second copy of a clip that can run to tens of megabytes.
      await uploadSealedFile(meta, meta.kind === 'video' ? 'video_chunk' : 'audio_chunk', chunk);

      protestMutationMarkers.utils.acceptMutations(transaction);

      await database.write(() =>
        row.update((r) => {
          r.synced = true;
        }),
      );
      // Only now: until the blob is durably stored this file is the only copy.
      try {
        if (chunk.exists) chunk.delete();
      } catch (cleanupError) {
        logger.error('protest: failed to delete an uploaded media chunk', { cleanupError });
      }
      logger.debug('protest: media chunk marked synced', {
        sessionId: meta.sessionId,
        blobId: meta.blobId,
      });
    },
  },
});
