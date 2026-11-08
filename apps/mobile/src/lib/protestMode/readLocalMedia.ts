import { Directory, File, Paths } from 'expo-file-system';
import { Q } from '@nozbe/watermelondb';
import { database } from '../watermelon/database';
import { PROTEST_MEDIA_CHUNK_TABLE } from '../watermelon/schema';
import { ProtestMediaChunk } from '../watermelon/models/ProtestMediaChunk';
import { getProtestSessionKey } from './keyStore';
import { decryptBlob, parseMediaChunk } from './crypto';
import type { ReadAudioChunk, ReadVideoChunk } from './readSession';
import { logger } from '../../logger';

/** Prefix of every decrypted file, written both here and by `readSession`. */
const DECRYPTED_PREFIX = /^protest-(audio|video)-/;

/**
 * Deletes the plaintext media left in the cache by a playback screen.
 *
 * Both read paths have to write the decrypted bytes to a file, because a
 * player takes a uri and nothing in `expo-audio`/`expo-video` accepts raw
 * bytes. That plaintext is exactly what sealing a chunk exists to avoid, so it
 * is cleared as soon as the screen that needed it is gone, and again at
 * startup to catch a crash in between. Nothing else evicts it: the OS only
 * reclaims a cache directory under disk pressure.
 */
export const sweepDecryptedMedia = (): void => {
  const cache = new Directory(Paths.cache);
  if (!cache.exists) return;

  for (const entry of cache.list()) {
    if (entry instanceof Directory || !DECRYPTED_PREFIX.test(entry.name)) continue;
    try {
      entry.delete();
    } catch (error) {
      logger.error('protest: failed to sweep a decrypted media file', { error });
    }
  }
};

/**
 * The media this device still holds for a session, decrypted.
 *
 * Positions survive an upload failure in the UI because they live in
 * WatermelonDB as plaintext rows. Media does not: a chunk is sealed the
 * moment the recorder closes it, so all that is local is ciphertext plus a
 * row pointing at it, and until this existed nothing could show it.
 *
 * Deliberately not the mirror of the remote read: a chunk is on disk only
 * while it is *unsent* (`protestExecutor` deletes the file once the blob is
 * durably stored), so this returns what the server does not have yet rather
 * than a second copy of what it does.
 *
 * Writing the plaintext to the cache is what the remote path already does -
 * a player needs a uri, and there is no way around that.
 */
export const readLocalMediaChunks = async (
  userId: string,
  sessionId: string,
): Promise<{ audio: ReadAudioChunk[]; video: ReadVideoChunk[] }> => {
  const rows = await database
    .get<ProtestMediaChunk>(PROTEST_MEDIA_CHUNK_TABLE)
    .query(Q.where('session_id', sessionId))
    .fetch();
  if (rows.length === 0) return { audio: [], video: [] };

  const sessionKey = await getProtestSessionKey(userId, sessionId);
  if (!sessionKey) return { audio: [], video: [] };

  const audio: ReadAudioChunk[] = [];
  const video: ReadVideoChunk[] = [];

  for (const row of [...rows].sort((a, b) => a.seq - b.seq)) {
    // Null before schema v7, when the table only ever held audio.
    const kind = row.kind ?? 'audio';
    try {
      const sealed = new File(row.uri);
      // Gone means uploaded: the remote read is what shows it from here on.
      if (!sealed.exists) continue;

      const { header, media } = parseMediaChunk(decryptBlob(sessionKey, await sealed.bytes()));
      const decoded = new File(
        Paths.cache,
        `protest-${kind}-${row.blobId}.${kind === 'audio' ? 'm4a' : 'mp4'}`,
      );
      decoded.create({ overwrite: true, intermediates: true });
      await decoded.write(media);

      const common = {
        blobId: row.blobId,
        startedAt: new Date(header.startedAtMs),
        durationMs: header.durationMs,
        uri: decoded.uri,
        synced: false,
      };
      if (kind === 'audio') {
        audio.push({ ...common, gapBeforeMs: header.gapBeforeMs ?? 0 });
      } else {
        video.push(common);
      }
    } catch (error) {
      // One unreadable chunk must not hide the rest of the session.
      logger.error('protest: could not read a local media chunk', { uri: row.uri, error });
    }
  }

  return { audio, video };
};
