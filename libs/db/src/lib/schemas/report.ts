import { pgTable, pgEnum, text, timestamp, uuid, index } from 'drizzle-orm/pg-core';
import { geometryPoint } from '../customTypes/geometryPoint';

export const reportTypeEnum = pgEnum('report_type_enum', [
  'tear_gas',
  'police_presence',
  'arrest',
  'violence',
  'road_block',
  'medical',
  'water_cannon',
  'kettling',
  'other',
]);

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
    type: reportTypeEnum('type').notNull(),
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
  ],
);
