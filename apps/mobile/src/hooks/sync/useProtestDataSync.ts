import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { createOrGetSession, endSession, upload } from '@libs/api-js';
import { database } from '../../lib/watermelon/database';
import {
  getUnsyncedSessions,
  getUnsyncedPointsForSession,
  markPointsSynced,
} from '../../lib/watermelon/protestSessions';
import type { ProtestSession } from '../../lib/watermelon/models/ProtestSession';
import { encryptWithDek } from '../../lib/recoveryKey/dekCipher';
import { useAuth } from '../../providers/AuthProvider';
import { logger } from '../../logger';

/**
 * Pushes a locally-open-or-closed session to the server. Idempotent on
 * both calls (`createOrGetSession` no-ops if it already exists,
 * `endSession` just re-sets the same client-recorded `endedAt`), so a
 * retry after a partial failure is always safe.
 */
const pushSession = async (session: ProtestSession): Promise<boolean> => {
  try {
    // `throwOnError: true` on every call in this file - the generated
    // client otherwise resolves a 4xx/5xx as `{ error }` without
    // throwing, which would make a failed push look identical to a
    // successful one here and get marked `synced` anyway. That's the one
    // thing this feature can't tolerate: silently losing evidence data.
    await createOrGetSession({
      path: { id: session.id },
      body: { startedAt: session.startedAt.toISOString() },
      throwOnError: true,
    });
    if (session.endedAt) {
      await endSession({
        path: { id: session.id },
        body: { endedAt: session.endedAt.toISOString() },
        throwOnError: true,
      });
    }
    await database.write(() =>
      session.update((s) => {
        s.synced = true;
      }),
    );
    return true;
  } catch (error) {
    logger.error('protest session push failed, will retry on reconnect', { error });
    return false;
  }
};

/**
 * Encrypts `plaintext` with the account's DEK and uploads it as one
 * `kind` blob for `sessionId`. The generated client has no typed body for
 * this endpoint (multipart isn't representable in the OpenAPI schema the
 * same way `set_avatar` isn't) - `body` is cast past its `never` type,
 * same escape hatch any multipart call through this generated SDK needs.
 */
const uploadBlob = async (
  userId: string,
  sessionId: string,
  kind: 'position_batch' | 'audio_chunk',
  plaintext: Uint8Array,
): Promise<boolean> => {
  try {
    const encryptedHex = await encryptWithDek(userId, plaintext);
    const formData = new FormData();
    formData.append('kind', kind);
    formData.append('file', encryptedHex);

    await upload({
      path: { id: sessionId },
      body: formData as never,
      throwOnError: true,
    });
    return true;
  } catch (error) {
    logger.error('protest upload failed, will retry on reconnect', { error });
    return false;
  }
};

/** Call after `recordLocationPoint`s accumulate - batches them into one upload. */
export const pushPendingLocationBatch = async (
  userId: string,
  sessionId: string,
): Promise<void> => {
  const session = (await getUnsyncedSessions()).find((s) => s.id === sessionId);
  if (session && !(await pushSession(session))) {
    return; // session isn't on the server yet - the upload's FK would fail, retry later
  }

  const points = await getUnsyncedPointsForSession(sessionId);
  if (points.length === 0) {
    return;
  }

  const payload = points.map((p) => ({
    lat: p.lat,
    lng: p.lng,
    recordedAt: p.recordedAt.toISOString(),
  }));
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));

  if (await uploadBlob(userId, sessionId, 'position_batch', plaintext)) {
    await markPointsSynced(points);
  }
};

/** Call once a recorded audio segment file is finished. */
export const pushAudioChunk = async (
  userId: string,
  sessionId: string,
  plaintext: Uint8Array,
): Promise<boolean> => {
  const session = (await getUnsyncedSessions()).find((s) => s.id === sessionId);
  if (session && !(await pushSession(session))) {
    return false;
  }
  return uploadBlob(userId, sessionId, 'audio_chunk', plaintext);
};

/** Re-attempts every not-yet-synced session/batch - call on reconnect. */
const pushAllPending = async (): Promise<void> => {
  const sessions = await getUnsyncedSessions();
  await Promise.all(sessions.map(pushSession));
};

/**
 * Retries every not-yet-synced local protest-mode session as soon as
 * connectivity comes back - mount once near the app root (see
 * `providers/Providers.tsx`). Doesn't retry location/audio uploads on its
 * own (those need the account's DEK + the actual plaintext, already
 * handled where they're produced - `locationTask.ts`/
 * `useProtestAudioRecording.ts`) - this only guarantees the *session*
 * rows themselves eventually land, since their FK blocks every upload
 * until they do.
 */
export const useProtestDataSync = () => {
  const { user } = useAuth();
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!user) {
      return;
    }
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      if (isOnline && wasOffline.current) {
        pushAllPending();
      }
      wasOffline.current = !isOnline;
    });

    return unsubscribe;
  }, [user]);
};
