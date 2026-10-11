import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  jsonb,
  pgSchema,
  primaryKey,
  text,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core';

export const systemSchema = pgSchema('system');

export const systemConfig = systemSchema.table('config', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const appPlatformEnum = systemSchema.enum('platform', ['ios', 'android', 'web']);

// Mirrors the pattern the Rust API validates the same field with (see
// `apps/api/src/app/internal/version_policy/dto.rs`) - no shared lib across
// the Rust/TS boundary to enforce that automatically, so keep both in sync
// by hand.
const VERSION_PATTERN = '^\\d+(\\.\\d+){0,2}$';

// One row per (platform, version) ever reported, not one row per platform: a
// version stays `pending` until the App Store Connect webhook (iOS only for
// now) confirms it's actually live on the store, since review can lag the CI
// publish step by hours or days. Android has no equivalent webhook yet, so
// its rows stay `pending` indefinitely (see
// apps/api/src/app/webhooks/app_store_connect) - `minVersion`/`latestVersion`
// are derived only from `live` rows, never from `pending` ones.
export const versionReleaseStateEnum = systemSchema.enum('version_release_state', [
  'pending',
  'live',
]);

export const versionPolicy = systemSchema.table(
  'version_policy',
  {
    platform: appPlatformEnum().notNull(),
    version: text('version').notNull(),
    // A release-please MAJOR bump: once live, it raises the enforced minVersion.
    isBreaking: boolean('is_breaking').notNull().default(false),
    state: versionReleaseStateEnum().notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .$onUpdate(() => sql`now()`)
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.platform, table.version] }),
    check('check_version_policy_version', sql`version ~ ${sql.raw(`'${VERSION_PATTERN}'`)}`),
  ],
);
