import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { setGenerator } from '@nozbe/watermelondb/utils/common/randomId';
import { randomUUID } from 'expo-crypto';
import { watermelonSchema } from './schema';
import { watermelonMigrations } from './migrations';
import { Report } from './models/Report';
import { logger } from '../../logger';

// Global override (applies to every table, no per-collection option exists
// upstream) - makes every locally-created record id a real UUID, matching
// the server's `uuid` columns instead of WatermelonDB's native 16-char id
// format.
setGenerator(randomUUID);

const adapter = new SQLiteAdapter({
  schema: watermelonSchema,
  migrations: watermelonMigrations,
  jsi: true,
  onSetUpError: (error) => {
    logger.error('watermelondb setup error', { error });
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Report],
});
