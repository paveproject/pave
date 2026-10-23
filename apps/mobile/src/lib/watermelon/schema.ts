import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const REPORT_TABLE = 'reports';

/**
 * Local-only outbox for map reports (see `models/Report.ts`) - not a
 * general-purpose WatermelonDB `synchronize()` setup. A report is written
 * here immediately on creation (so it survives being offline), then pushed
 * to the API as soon as that succeeds; `synced` tracks whether that push
 * has landed yet. Reading other users' reports on the map is a plain
 * `GET /reports` fetch (see `@libs/query-client`), not stored here at all -
 * only the write side needs offline durability.
 *
 * `protest_sessions`/`location_points` (v2) were removed in v3 - the
 * protest-mode recording feature built on them never worked reliably and
 * was pulled out entirely (see `migrations.ts`).
 */
export const watermelonSchema = appSchema({
  version: 3,
  tables: [
    tableSchema({
      name: REPORT_TABLE,
      columns: [
        { name: 'type', type: 'string' },
        { name: 'lat', type: 'number' },
        { name: 'lng', type: 'number' },
        { name: 'occurred_at', type: 'number' },
        { name: 'synced', type: 'boolean' },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});
