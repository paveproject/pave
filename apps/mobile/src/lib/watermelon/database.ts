import { Database } from '@nozbe/watermelondb';
import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { watermelonSchema } from './schema';
import { Report } from './models/Report';
import { logger } from '../../logger';

const adapter = new SQLiteAdapter({
  schema: watermelonSchema,
  jsi: true,
  onSetUpError: (error) => {
    logger.error('watermelondb setup error', { error });
  },
});

export const database = new Database({
  adapter,
  modelClasses: [Report],
});
