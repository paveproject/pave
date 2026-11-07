import Share from 'react-native-share';
import type { MediaChunkKind } from '../watermelon/models/ProtestMediaChunk';
import { logger } from '../../logger';

const MIME_TYPE: Record<MediaChunkKind, string> = {
  audio: 'audio/m4a',
  video: 'video/mp4',
};

const EXTENSION: Record<MediaChunkKind, string> = { audio: 'm4a', video: 'mp4' };

const stamp = (startedAt: Date): string =>
  `${startedAt.getFullYear()}-${String(startedAt.getMonth() + 1).padStart(2, '0')}-${String(
    startedAt.getDate(),
  ).padStart(2, '0')}-${String(startedAt.getHours()).padStart(2, '0')}${String(
    startedAt.getMinutes(),
  ).padStart(2, '0')}${String(startedAt.getSeconds()).padStart(2, '0')}`;

/**
 * Hands one decrypted chunk to the system share sheet.
 *
 * The uri is the plaintext copy in the cache, the one the player already uses
 * - which is also the point to be aware of: what leaves here is no longer
 * covered by the session's encryption, and nothing downstream can walk it
 * back.
 *
 * `failOnCancel: false` because dismissing the sheet is a normal outcome, not
 * an error to report.
 */
export const shareMediaChunk = async (params: {
  kind: MediaChunkKind;
  uri: string;
  startedAt: Date;
}): Promise<void> => {
  try {
    await Share.open({
      url: params.uri,
      type: MIME_TYPE[params.kind],
      filename: `pave-${params.kind}-${stamp(params.startedAt)}.${EXTENSION[params.kind]}`,
      failOnCancel: false,
    });
  } catch (error) {
    logger.error('protest: sharing a media chunk failed', { kind: params.kind, error });
  }
};
