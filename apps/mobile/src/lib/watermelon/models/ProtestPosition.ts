import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';
import { PROTEST_POSITION_TABLE } from '../schema';

/**
 * One GPS sample inside a session, written by the background location task
 * (`lib/protestMode/locationTask.ts`) and batched into an encrypted blob by
 * the sync executor.
 *
 * `synced` flips only once the batch carrying this point is durably stored
 * server-side - never on enqueue. That distinction is what the first version
 * of this feature got wrong, and it is the difference between "the evidence
 * is safe" and "the evidence looked safe".
 */
export class ProtestPosition extends Model {
  static table = PROTEST_POSITION_TABLE;

  @field('session_id') sessionId!: string;
  @field('lat') lat!: number;
  @field('lng') lng!: number;
  @field('accuracy') accuracy!: number | null;
  @date('recorded_at') recordedAt!: Date;
  @field('synced') synced!: boolean;
}
