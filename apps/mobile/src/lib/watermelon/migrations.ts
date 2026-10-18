import { schemaMigrations, createTable } from '@nozbe/watermelondb/Schema/migrations';
import { PROTEST_SESSION_TABLE, LOCATION_POINT_TABLE } from './schema';

// First-ever migration in this codebase (schema was at version 1 with no
// migrations file - every install so far has been a fresh database). From
// here on, any schema.ts change needs a matching step here.
export const watermelonMigrations = schemaMigrations({
  migrations: [
    {
      toVersion: 2,
      steps: [
        createTable({
          name: PROTEST_SESSION_TABLE,
          columns: [
            { name: 'started_at', type: 'number' },
            { name: 'ended_at', type: 'number', isOptional: true },
            { name: 'synced', type: 'boolean' },
          ],
        }),
        createTable({
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
    },
  ],
});
