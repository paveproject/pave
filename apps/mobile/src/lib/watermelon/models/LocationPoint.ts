import { Model } from '@nozbe/watermelondb';
import { field, date } from '@nozbe/watermelondb/decorators';
import { LOCATION_POINT_TABLE } from '../schema';

export class LocationPoint extends Model {
  static table = LOCATION_POINT_TABLE;

  @field('session_id') sessionId!: string;
  @field('lat') lat!: number;
  @field('lng') lng!: number;
  @date('recorded_at') recordedAt!: Date;
  @field('synced') synced!: boolean;
}
