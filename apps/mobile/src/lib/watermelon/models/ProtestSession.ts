import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';
import { PROTEST_SESSION_TABLE } from '../schema';

/**
 * One protest-mode recording window on this device. The row's `id` is also
 * the server's, minted here before any round-trip is possible, so a replayed
 * push lands on the same session instead of creating a second one.
 *
 * `sealedKey` is the session's symmetric key sealed under the account DEK -
 * the key itself is in SecureStore, never here (SQLite isn't encrypted).
 */
export class ProtestSession extends Model {
  static table = PROTEST_SESSION_TABLE;

  @date('started_at') startedAt!: Date;
  /** Null while recording. */
  @date('ended_at') endedAt!: Date | null;
  @field('sealed_key') sealedKey!: string;
  @field('next_seq') nextSeq!: number;
  @field('synced') synced!: boolean;
}
