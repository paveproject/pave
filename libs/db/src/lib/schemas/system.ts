import { pgSchema, varchar, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const systemSchema = pgSchema('system');

export const systemConfig = systemSchema.table('config', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
