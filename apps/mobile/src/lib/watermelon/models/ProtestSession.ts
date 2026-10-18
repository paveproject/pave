import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';
import { PROTEST_SESSION_TABLE } from '../schema';

export class ProtestSession extends Model {
  static table = PROTEST_SESSION_TABLE;

  @date('started_at') startedAt!: Date;
  @date('ended_at') endedAt!: Date | null;
  @field('synced') synced!: boolean;
}
