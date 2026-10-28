import { Model } from '@nozbe/watermelondb';
import { field, date, readonly } from '@nozbe/watermelondb/decorators';
import { REPORT_TABLE } from '../schema';
import type { ReportTypeKey } from '@libs/constants';

export class Report extends Model {
  static table = REPORT_TABLE;

  @field('type') type!: ReportTypeKey;
  @field('lat') lat!: number;
  @field('lng') lng!: number;
  @date('occurred_at') occurredAt!: Date;
  @field('synced') synced!: boolean;
  @readonly @date('created_at') createdAt!: Date;
}
