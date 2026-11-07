import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';
import { PROTEST_AUDIO_CHUNK_TABLE } from '../schema';

/**
 * One segment of a session's audio recording.
 *
 * The recorder is rotated on an interval rather than writing one long file:
 * a phone seized mid-protest has to have already uploaded everything up to
 * the last boundary. `uri` is the encrypted segment - unlike a position,
 * which lives in this database as plaintext, raw audio is written to disk by
 * the OS and is sealed as soon as the recorder closes it.
 *
 * `synced` flips only once the blob is durably stored server-side, and
 * `blobId` is minted with the row so every retry re-uploads *the same* blob
 * - `(session, seq)` is unique server-side, so a fresh id per attempt would
 * collide with the attempt that may already have landed.
 */
export class ProtestAudioChunk extends Model {
  static table = PROTEST_AUDIO_CHUNK_TABLE;

  @field('session_id') sessionId!: string;
  @field('seq') seq!: number;
  @field('blob_id') blobId!: string;
  @field('uri') uri!: string;
  @date('started_at') startedAt!: Date;
  @field('duration_ms') durationMs!: number;
  @field('synced') synced!: boolean;
}
