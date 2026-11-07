import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';
import { PROTEST_MEDIA_CHUNK_TABLE } from '../schema';

export type MediaChunkKind = 'audio' | 'video';

/**
 * One sealed piece of a session's media: a rotated audio segment, or a whole
 * video clip.
 *
 * Audio rotates on an interval rather than writing one long file, so a phone
 * seized mid-protest has already uploaded everything up to the last boundary.
 * Video does not: an MP4 keeps its index at the end of the file, so nothing
 * before the recording stops is playable anyway (see `protestVideo.ts`).
 *
 * `uri` is the encrypted file - unlike a position, which lives in this
 * database as plaintext, media is written to disk by the OS and is sealed as
 * soon as the recorder closes it.
 *
 * `synced` flips only once the blob is durably stored server-side, and
 * `blobId` is minted with the row so every retry re-uploads *the same* blob
 * - `(session, seq)` is unique server-side, so a fresh id per attempt would
 * collide with the attempt that may already have landed.
 */
export class ProtestMediaChunk extends Model {
  static table = PROTEST_MEDIA_CHUNK_TABLE;

  @field('session_id') sessionId!: string;
  @field('seq') seq!: number;
  /** Null on rows written before schema v7, which only ever held audio. */
  @field('kind') kind!: MediaChunkKind | null;
  @field('blob_id') blobId!: string;
  @field('uri') uri!: string;
  @date('started_at') startedAt!: Date;
  @field('duration_ms') durationMs!: number;
  @field('synced') synced!: boolean;
}
