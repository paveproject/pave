import { File, Directory, Paths } from 'expo-file-system';
import { encryptBlob, frameAudioChunk } from './crypto';
import { getProtestSessionKey } from './keyStore';
import { logger } from '../../logger';

/**
 * Where sealed segments wait for their upload. Its own directory so
 * `clearLocalProtestData` can reason about it, and under `document`, not
 * `cache`: the OS may evict a cache directory under pressure, and until the
 * blob lands this file is the only copy of that minute of audio.
 */
const chunkDirectory = () => new Directory(Paths.document, 'protest-audio');

/**
 * Moves a just-closed segment out of the recorder's own path.
 *
 * Called *before* the recorder is prepared for the next segment, because
 * nothing in `expo-audio`'s contract says `prepareToRecordAsync` picks a new
 * file - if it reuses one, the next segment overwrites the one about to be
 * sealed. A rename on the same filesystem, so it costs the rotation gap
 * almost nothing.
 */
export const claimSegmentFile = (sourceUri: string, sessionId: string): string => {
  const directory = chunkDirectory();
  if (!directory.exists) directory.create({ intermediates: true });

  const source = new File(sourceUri);
  const claimed = new File(directory, `${sessionId}-${Date.now()}-raw`);
  source.move(claimed);
  return claimed.uri;
};

/** Where a sealed segment landed, for the caller to write a row against. */
export interface SealedChunk {
  ciphertextUri: string;
  startedAt: Date;
  durationMs: number;
}

/**
 * Seals one finished segment and deletes the plaintext.
 *
 * The plaintext window is the whole reason this runs the moment a segment
 * closes rather than at upload time: between the recorder writing the file
 * and this returning, unencrypted audio exists on disk. Everything after is
 * ciphertext.
 *
 * `sourceUri` is expected to have come through `claimSegmentFile`. Writing the
 * row is the caller's job: reaching into `protestSessions` from here closed a
 * require cycle, and Metro warns that such a cycle can hand out uninitialized
 * values.
 */
export const sealChunk = async (params: {
  userId: string;
  sessionId: string;
  /** The file the recorder just closed. Deleted before this returns, whatever
   * happens to the rest. */
  sourceUri: string;
  startedAt: Date;
  durationMs: number;
  gapBeforeMs: number;
  mimeType: string;
}): Promise<SealedChunk> => {
  const source = new File(params.sourceUri);
  try {
    const sessionKey = await getProtestSessionKey(params.userId, params.sessionId);
    if (!sessionKey) throw new Error(`no local key for protest session ${params.sessionId}`);

    const framed = frameAudioChunk(
      {
        startedAtMs: params.startedAt.getTime(),
        durationMs: params.durationMs,
        mimeType: params.mimeType,
        gapBeforeMs: params.gapBeforeMs,
      },
      await source.bytes(),
    );

    const directory = chunkDirectory();
    if (!directory.exists) directory.create({ intermediates: true });
    const sealed = new File(directory, `${params.sessionId}-${params.startedAt.getTime()}.bin`);
    sealed.create({ overwrite: true, intermediates: true });
    await sealed.write(encryptBlob(sessionKey, framed));

    return {
      ciphertextUri: sealed.uri,
      startedAt: params.startedAt,
      durationMs: params.durationMs,
    };
  } finally {
    try {
      if (source.exists) source.delete();
    } catch (error) {
      // Worth shouting about: a plaintext segment left behind is exactly what
      // the sealing above exists to avoid.
      logger.error('protest: failed to delete a plaintext audio segment', { error });
    }
  }
};

/**
 * Deletes sealed segments with no row pointing at them.
 *
 * `clearLocalProtestData` deletes files by row, so a crash between writing a
 * file and writing its row orphans one - a minute of audio nothing will ever
 * upload or clean up, and plaintext if the crash came before the sealing.
 * Called on session start, the one moment nothing can be in flight.
 */
export const sweepOrphanedChunks = async (knownUris: Set<string>): Promise<void> => {
  const directory = chunkDirectory();
  if (!directory.exists) return;

  for (const entry of directory.list()) {
    if (entry instanceof Directory || knownUris.has(entry.uri)) continue;
    // Includes `-raw` files, and those matter most: a segment abandoned
    // between the move and its row is *plaintext* audio. Nothing is recording
    // when this runs, so anything still here is abandoned by definition.
    try {
      entry.delete();
      logger.debug('protest: swept an orphaned audio chunk', { uri: entry.uri });
    } catch (error) {
      logger.error('protest: failed to sweep an orphaned audio chunk', { error });
    }
  }
};
