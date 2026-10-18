import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { watermelonSchema } from './schema';
import { watermelonMigrations } from './migrations';
import { Report } from './models/Report';
import { ProtestSession } from './models/ProtestSession';
import { LocationPoint } from './models/LocationPoint';
import { logger } from '../../logger';

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
  modelClasses: [Report, ProtestSession, LocationPoint],
});
