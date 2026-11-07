import { File, Directory, Paths } from 'expo-file-system';
import { encryptBlob, frameMediaChunk } from './crypto';
import { getProtestSessionKey } from './keyStore';
import { logger } from '../../logger';
import type { MediaChunkKind } from '../watermelon/models/ProtestMediaChunk';

/**
 * Where sealed media waits for its upload. Its own directory per kind so
 * `clearLocalProtestData` can reason about them, and under `document`, not
 * `cache`: the OS may evict a cache directory under pressure, and until the
 * blob lands this file is the only copy of that piece of the recording.
 *
 * `protest-audio` rather than something symmetrical with video: devices
 * already hold files under that name, and renaming it would orphan them.
 */
const chunkDirectory = (kind: MediaChunkKind) =>
  new Directory(Paths.document, kind === 'audio' ? 'protest-audio' : 'protest-video');

/**
 * Moves a just-closed segment out of the recorder's own path.
 *
 * Called *before* the recorder is prepared for the next segment, because
 * nothing in `expo-audio`'s contract says `prepareToRecordAsync` picks a new
 * file - if it reuses one, the next segment overwrites the one about to be
 * sealed. A rename on the same filesystem, so it costs the rotation gap
 * almost nothing.
 */
export const claimSegmentFile = (
  sourceUri: string,
  sessionId: string,
  kind: MediaChunkKind,
): string => {
  const directory = chunkDirectory(kind);
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
 * Seals one finished segment or clip and deletes the plaintext.
 *
 * The plaintext window is the whole reason this runs the moment a recorder
 * closes its file rather than at upload time: between that and this
 * returning, unencrypted media exists on disk. Everything after is
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
  kind: MediaChunkKind;
  /** The file the recorder just closed. Deleted before this returns, whatever
   * happens to the rest. */
  sourceUri: string;
  startedAt: Date;
  durationMs: number;
  /** Audio only: the silence lost at a rotation boundary. */
  gapBeforeMs?: number;
  mimeType: string;
}): Promise<SealedChunk> => {
  const source = new File(params.sourceUri);
  try {
    const sessionKey = await getProtestSessionKey(params.userId, params.sessionId);
    if (!sessionKey) throw new Error(`no local key for protest session ${params.sessionId}`);

    const framed = frameMediaChunk(
      {
        startedAtMs: params.startedAt.getTime(),
        durationMs: params.durationMs,
        mimeType: params.mimeType,
        gapBeforeMs: params.gapBeforeMs,
      },
      await source.bytes(),
    );

    const directory = chunkDirectory(params.kind);
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
      logger.error('protest: failed to delete a plaintext media segment', { error });
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
  for (const kind of ['audio', 'video'] as const) {
    const directory = chunkDirectory(kind);
    if (!directory.exists) continue;

    for (const entry of directory.list()) {
      if (entry instanceof Directory || knownUris.has(entry.uri)) continue;
      // Includes `-raw` files, and those matter most: a segment abandoned
      // between the move and its row is *plaintext*. Nothing is recording when
      // this runs, so anything still here is abandoned by definition.
      try {
        entry.delete();
        logger.debug('protest: swept an orphaned media chunk', { uri: entry.uri });
      } catch (error) {
        logger.error('protest: failed to sweep an orphaned media chunk', { error });
      }
    }
  }
};
