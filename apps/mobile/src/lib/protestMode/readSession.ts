import { File, Paths } from 'expo-file-system';
import { listSessions } from '@libs/api-js';
import type { ProtestSessionResponse } from '@libs/api-js';
import { API_ENDPOINT } from '../../env/common';
import { getSessionToken } from '../auth/session';
import { decryptBlob, openMetadata, openSessionKey } from './crypto';
import { logger } from '../../logger';

/** What a `position_batch` blob holds, as written by `protestExecutor`. */
interface StoredPosition {
  lat: number;
  lng: number;
  accuracy: number | null;
  recordedAt: string;
}

/** The session's own timestamps, from its encrypted `metadata` column. */
interface StoredEnvelope {
  startedAt: string;
  endedAt: string | null;
}

export interface ReadPosition {
  lat: number;
  lng: number;
  accuracy: number | null;
  recordedAt: Date;
}

export interface ReadSession {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  positions: ReadPosition[];
}

/**
 * Reads recordings back from the server and decrypts them.
 *
 * This is the half of protest mode that makes the rest worth anything: a
 * device that no longer holds the local database - reinstalled, replaced,
 * or simply not the one that recorded - can still get the trajectory back,
 * provided it holds the account DEK (via the recovery phrase or a sibling).
 * Everything is decrypted here, on the device; the server never has a key.
 */

/**
 * Downloads one blob to a cache file and reads its bytes.
 *
 * Not the generated client: `downloadBlob` types the body as a `Blob`, and
 * React Native's `Blob` exposes no way to get at raw bytes - `FileReader`
 * has no `readAsArrayBuffer` there. The symmetric problem to the upload
 * path, solved the same way, through an `expo-file-system` file.
 */
const fetchBlobBytes = async (
  sessionId: string,
  blobId: string,
  token: string,
): Promise<Uint8Array> => {
  const staged = new File(Paths.cache, `protest-read-${blobId}.bin`);
  try {
    await File.downloadFileAsync(
      `${API_ENDPOINT}/protest-session/${sessionId}/blob/${blobId}`,
      staged,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return await staged.bytes();
  } finally {
    // Ciphertext in the cache is still someone's trajectory.
    if (staged.exists) staged.delete();
  }
};

/** Opens one session row: its key, then its timestamps, then every batch. */
const openSession = async (
  userId: string,
  row: ProtestSessionResponse,
  token: string,
): Promise<ReadSession> => {
  const sessionKey = await openSessionKey(userId, row.sealedKey);
  const envelope = openMetadata<StoredEnvelope>(sessionKey, row.metadata);

  const batches = row.blobs
    .filter((blob) => blob.kind === 'position_batch')
    .sort((a, b) => a.seq - b.seq);

  const positions: ReadPosition[] = [];
  for (const blob of batches) {
    const ciphertext = await fetchBlobBytes(row.id, blob.id, token);
    const plaintext = JSON.parse(
      new TextDecoder().decode(decryptBlob(sessionKey, ciphertext)),
    ) as StoredPosition[];
    for (const entry of plaintext) {
      positions.push({
        lat: entry.lat,
        lng: entry.lng,
        accuracy: entry.accuracy,
        recordedAt: new Date(entry.recordedAt),
      });
    }
  }

  // By time, not by `seq`: a batch is ordered, but two batches queued
  // concurrently can interleave.
  positions.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  return {
    id: row.id,
    startedAt: new Date(envelope.startedAt),
    endedAt: envelope.endedAt ? new Date(envelope.endedAt) : null,
    positions,
  };
};

/**
 * Every session the server holds for this account, decrypted.
 *
 * One that cannot be opened is skipped rather than failing the batch - a
 * single unreadable envelope (a key this device never held) must not hide
 * every other recording.
 */
export const readRemoteSessions = async (userId: string): Promise<ReadSession[]> => {
  const token = await getSessionToken();
  if (!token) throw new Error('not signed in');

  const { data, error } = await listSessions({ path: { user_id: userId } });
  if (error) throw error;
  if (!data) return [];

  const out: ReadSession[] = [];
  for (const row of data) {
    try {
      out.push(await openSession(userId, row, token));
    } catch (failure) {
      logger.error('protest: could not read a session back', { sessionId: row.id, failure });
    }
  }
  return out.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
};

/** One session, by id - reuses the list because there is no `GET` for a
 * single session, the row only travels with its siblings. */
export const readRemoteSession = async (
  userId: string,
  sessionId: string,
): Promise<ReadSession | null> =>
  (await readRemoteSessions(userId)).find((session) => session.id === sessionId) ?? null;
