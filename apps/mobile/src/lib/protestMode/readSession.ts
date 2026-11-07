import { File, Paths } from 'expo-file-system';
import { getSession, listSessions } from '@libs/api-js';
import type { ProtestSessionResponse } from '@libs/api-js';
import { API_ENDPOINT } from '../../env/common';
import { getSessionToken } from '../auth/session';
import {
  decryptBlob,
  openMetadata,
  openSessionKey,
  openSessionKeyWithDek,
  parseAudioChunk,
} from './crypto';
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

/**
 * Whose recordings to read, when they are not the signed-in user's. The `dek`
 * is the *owner's*, reconstructed from a quorum and held in memory alone - it
 * must never reach this device's own key store.
 */
export interface ProtestDataSource {
  ownerUserId: string;
  dek: Uint8Array;
}

/** One decrypted audio segment, written to a local file so a player can take
 * a uri. The caller owns the file and should delete it when done. */
export interface ReadAudioChunk {
  startedAt: Date;
  durationMs: number;
  /** Silence lost while the recorder rotated, before this segment. */
  gapBeforeMs: number;
  uri: string;
}

export interface ReadSession {
  id: string;
  startedAt: Date;
  endedAt: Date | null;
  positions: ReadPosition[];
  audio: ReadAudioChunk[];
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

/**
 * Opens one session row: its key, then its timestamps, then every batch.
 *
 * `dek` is for the trusted-contact path - the owner's DEK, reconstructed from
 * a quorum of shares and held in memory only. Omitted, the reader is the owner
 * and the DEK comes from their own store.
 */
const openSession = async (
  userId: string,
  row: ProtestSessionResponse,
  token: string,
  dek?: Uint8Array,
): Promise<ReadSession> => {
  const sessionKey = dek
    ? openSessionKeyWithDek(dek, row.sealedKey)
    : await openSessionKey(userId, row.sealedKey);
  const envelope = openMetadata<StoredEnvelope>(sessionKey, row.metadata);

  const ordered = [...row.blobs].sort((a, b) => a.seq - b.seq);

  const positions: ReadPosition[] = [];
  for (const blob of ordered.filter((entry) => entry.kind === 'position_batch')) {
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

  const audio: ReadAudioChunk[] = [];
  for (const blob of ordered.filter((entry) => entry.kind === 'audio_chunk')) {
    const ciphertext = await fetchBlobBytes(row.id, blob.id, token);
    const { header, media } = parseAudioChunk(decryptBlob(sessionKey, ciphertext));

    // Written out rather than returned as bytes: a player takes a uri, and
    // holding every segment of an hour-long recording in memory would not
    // survive the session it is meant to read.
    const decoded = new File(Paths.cache, `protest-audio-${blob.id}.m4a`);
    decoded.create({ overwrite: true, intermediates: true });
    await decoded.write(media);

    audio.push({
      startedAt: new Date(header.startedAtMs),
      durationMs: header.durationMs,
      gapBeforeMs: header.gapBeforeMs,
      uri: decoded.uri,
    });
  }

  // By time, not by `seq`: a batch is ordered, but two batches queued
  // concurrently can interleave.
  positions.sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

  return {
    id: row.id,
    startedAt: new Date(envelope.startedAt),
    endedAt: envelope.endedAt ? new Date(envelope.endedAt) : null,
    positions,
    audio,
  };
};

/**
 * Every session the server holds for this account, decrypted.
 *
 * One that cannot be opened is skipped rather than failing the batch - a
 * single unreadable envelope (a key this device never held) must not hide
 * every other recording.
 */
export const readRemoteSessions = async (
  userId: string,
  dek?: Uint8Array,
): Promise<ReadSession[]> => {
  const token = await getSessionToken();
  if (!token) throw new Error('not signed in');

  const { data, error } = await listSessions({ path: { user_id: userId } });
  if (error) throw error;
  if (!data) return [];

  const out: ReadSession[] = [];
  for (const row of data) {
    try {
      out.push(await openSession(userId, row, token, dek));
    } catch (failure) {
      logger.error('protest: could not read a session back', { sessionId: row.id, failure });
    }
  }
  return out.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
};

/** One session, by id, without pulling every sibling along. */
export const readRemoteSession = async (
  userId: string,
  sessionId: string,
  dek?: Uint8Array,
): Promise<ReadSession | null> => {
  const token = await getSessionToken();
  if (!token) throw new Error('not signed in');

  const { data, error, response } = await getSession({
    path: { protest_session_id: sessionId },
  });
  // 404 covers both "no such session" and "not yours" - the route can't tell
  // them apart on purpose.
  if (response.status === 404) return null;
  if (error) throw error;
  if (!data) return null;

  return openSession(userId, data, token, dek);
};
