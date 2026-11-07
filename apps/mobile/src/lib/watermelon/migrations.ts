import {
  schemaMigrations,
  addColumns,
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
    {
      // New table names rather than the v2 ones the step above dropped: an
      // install that never reached v3 could still hold those, and
      // `createTable` on an existing table fails the whole migration.
      toVersion: 4,
      steps: [
        createTable({
          name: 'protest_session_rows',
          columns: [
            { name: 'started_at', type: 'number' },
            { name: 'ended_at', type: 'number', isOptional: true },
            { name: 'sealed_key', type: 'string' },
            { name: 'next_seq', type: 'number' },
            { name: 'synced', type: 'boolean' },
          ],
        }),
        createTable({
          name: 'protest_position_rows',
          columns: [
            { name: 'session_id', type: 'string', isIndexed: true },
            { name: 'lat', type: 'number' },
            { name: 'lng', type: 'number' },
            { name: 'accuracy', type: 'number', isOptional: true },
            { name: 'recorded_at', type: 'number' },
            { name: 'synced', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      toVersion: 5,
      steps: [
        createTable({
          name: 'protest_audio_chunk_rows',
          columns: [
            { name: 'session_id', type: 'string', isIndexed: true },
            { name: 'seq', type: 'number' },
            { name: 'uri', type: 'string' },
            { name: 'started_at', type: 'number' },
            { name: 'duration_ms', type: 'number' },
            { name: 'synced', type: 'boolean' },
          ],
        }),
      ],
    },
    {
      // `blob_id` could not be folded into the v5 step above: devices had
      // already run it, and a migration never re-applies - they ended up with
      // the table and without the column, which only showed up as a SQLite
      // error at the first recording. Its own version, as it should have been.
      toVersion: 6,
      steps: [
        addColumns({
          table: 'protest_audio_chunk_rows',
          columns: [{ name: 'blob_id', type: 'string' }],
        }),
      ],
    },
  ],
});
