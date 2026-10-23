import {
  schemaMigrations,
  createTable,
  unsafeExecuteSql,
} from '@nozbe/watermelondb/Schema/migrations';

// First-ever migration in this codebase (schema was at version 1 with no
// migrations file - every install so far has been a fresh database). From
// here on, any schema.ts change needs a matching step here.
//
// Table names below are plain string literals, not imported from
// `schema.ts` - a migration step has to keep working exactly as written
// forever, even after the schema it originally matched stops mentioning
// the table (see the v3 step, which drops what v2 created).
export const watermelonMigrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: 'protest_sessions',
          columns: [
            { name: 'started_at', type: 'number' },
            { name: 'ended_at', type: 'number', isOptional: true },
            { name: 'synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'location_points',
          columns: [
            { name: 'session_id', type: 'string', isIndexed: true },
            { name: 'lat', type: 'number' },
            { name: 'lng', type: 'number' },
            { name: 'recorded_at', type: 'number' },
            { name: 'synced', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      // The protest-mode recording feature these two tables backed was
      // pulled out entirely (never worked reliably) - no `dropTable` step
      // exists in this library's migration helpers, so this drops the raw
      // SQLite tables directly.
      toVersion: 3,
      steps: [
        unsafeExecuteSql('DROP TABLE IF EXISTS protest_sessions;'),
        unsafeExecuteSql('DROP TABLE IF EXISTS location_points;'),
      ],
    },
  ],
});
