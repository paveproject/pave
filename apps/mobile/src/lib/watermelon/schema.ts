import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const REPORT_TABLE = 'reports';
export const PROTEST_SESSION_TABLE = 'protest_sessions';
export const LOCATION_POINT_TABLE = 'location_points';

/**
 * Local-only outbox for map reports (see `models/Report.ts`) - not a
 * general-purpose WatermelonDB `synchronize()` setup. A report is written
 * here immediately on creation (so it survives being offline), then pushed
 * to the API as soon as that succeeds; `synced` tracks whether that push
 * has landed yet. Reading other users' reports on the map is a plain
 * `GET /reports` fetch (see `@libs/query-client`), not stored here at all -
 * only the write side needs offline durability.
 *
 * `protest_sessions`/`location_points` follow the exact same push-only
 * outbox shape, for protest mode's position recording (see
 * `protestSessions.ts`) - added in v2, see `migrations.ts`.
 */
export const watermelonSchema = appSchema({
  version: 2,
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
    tableSchema({
      name: PROTEST_SESSION_TABLE,
      columns: [
        { name: 'started_at', type: 'number' },
        { name: 'ended_at', type: 'number', isOptional: true },
        { name: 'synced', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: LOCATION_POINT_TABLE,
      columns: [
        { name: 'session_id', type: 'string', isIndexed: true },
        { name: 'lat', type: 'number' },
        { name: 'lng', type: 'number' },
        { name: 'recorded_at', type: 'number' },
        { name: 'synced', type: 'boolean' },
      ],
    }),
  ],
});
