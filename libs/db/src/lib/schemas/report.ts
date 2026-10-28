import {
  pgTable,
  text,
  timestamp,
  uuid,
  index,
  smallint,
  boolean,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { geometryPoint } from '../customTypes/geometryPoint';

/**
 * A projection of `REPORT_FAMILIES` in @libs/constants, not a source of truth -
 * it exists so `report_type.family_key` has something to reference.
 */
export const reportFamily = pgTable('report_family', {
  key: text('key').primaryKey(),
});

/**
 * A projection of `REPORT_TYPES` in @libs/constants, written by the seed. A
 * table rather than the old `report_type_enum` so `report.type` keeps a FK
 * (and so the API can validate a posted key) without a migration per added
 * type - but the taxonomy itself is declared in code, because a type is
 * unusable by a client that has no icon and no label for it and both ship
 * with the bundle.
 */
export const reportType = pgTable(
  'report_type',
  {
    key: text('key').primaryKey(),
    familyKey: text('family_key')
      .notNull()
      .references(() => reportFamily.key, { onDelete: 'restrict' }),
    /**
     * Mirrors `REPORT_TYPES[key].wire`. Stored only for the unique constraint,
     * which is what catches a duplicate hand-written wire code at seed time.
     */
    wireCode: smallint('wire_code').notNull().unique(),
    /**
     * Checked when a report is posted - defence in depth, since a client
     * shouldn't offer a disabled type in the first place.
     */
    enabled: boolean('enabled').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check('report_type_wire_code_u8', sql`${table.wireCode} between 0 and 254`),
    index('idx_report_type_family').on(table.familyKey),
  ],
);

/**
 * A situation reported at a point in time/space, created offline-first on
 * the device (see the mobile WatermelonDB setup) and pushed here once
 * connectivity allows. `id` is always client-generated (a UUID minted at
 * creation time, before any server round-trip is possible - WatermelonDB's
 * global id generator is pinned to `Crypto.randomUUID()`, see
 * `apps/mobile/src/lib/watermelon/database.ts`) so a repeated sync push of
 * the same report is a no-op, not a duplicate.
 *
 * Deliberately has no FK to a user - reports are anonymous by design, for
 * the reporter's own safety.
 */
export const report = pgTable(
  'report',
  {
    id: uuid('id').primaryKey(),
    // `restrict`, not `cascade`: retiring a type must never delete the reports
    // filed under it. Disable it with `report_type.enabled` instead.
    type: text('type')
      .notNull()
      .references(() => reportType.key, { onDelete: 'restrict' }),
    // SRID 4326 = WGS84 (plain lat/lng). `x` is longitude, `y` is latitude.
    location: geometryPoint('location').notNull(),
    // When the situation actually happened, as reported by the device - not
    // necessarily when the server received it (that gap is the whole point
    // of offline-first: this can be well in the past by the time it syncs).
    occurredAt: timestamp('occurred_at', { withTimezone: true, mode: 'string' }).notNull(),
    // When this row was actually written - server-side bookkeeping, not
    // shown to other users as "when it happened".
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    // Situations are ephemeral - stop surfacing a report once it's stale.
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [
    index('idx_report_location').using('gist', table.location),
    index('idx_report_expires_at').on(table.expiresAt),
    index('idx_report_type').on(table.type),
  ],
);
