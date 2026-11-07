import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const REPORT_TABLE = 'reports';
/** Not the `protest_sessions`/`location_points` of v2: those were dropped in
 * v3 and a residual SQLite file could still hold them. */
export const PROTEST_SESSION_TABLE = 'protest_session_rows';
export const PROTEST_POSITION_TABLE = 'protest_position_rows';
export const PROTEST_AUDIO_CHUNK_TABLE = 'protest_audio_chunk_rows';

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
 * was pulled out entirely (see `migrations.ts`). Protest mode came back in
 * v4 under the two tables below.
 *
 * A session's symmetric key is deliberately absent: SQLite is not encrypted,
 * so it lives in SecureStore and only its sealed form reaches a row.
 */
export const watermelonSchema = appSchema({
  version: 6,
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
        // Null while recording - mirrors the server's `active`.
        { name: 'ended_at', type: 'number', isOptional: true },
        { name: 'sealed_key', type: 'string' },
        { name: 'next_seq', type: 'number' },
        { name: 'synced', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: PROTEST_AUDIO_CHUNK_TABLE,
      columns: [
        { name: 'session_id', type: 'string', isIndexed: true },
        { name: 'seq', type: 'number' },
        // Minted with the row, not per upload attempt: `(session, seq)` is
        // unique server-side, so a replay that mints a fresh id would collide
        // with its own first attempt and fail for good.
        { name: 'blob_id', type: 'string' },
        // Points at *ciphertext*: a chunk is encrypted the moment the
        // recorder closes it, so a seized phone holds no plaintext audio for
        // whatever is still waiting to upload.
        { name: 'uri', type: 'string' },
        { name: 'started_at', type: 'number' },
        { name: 'duration_ms', type: 'number' },
        { name: 'synced', type: 'boolean' },
      ],
    }),
    tableSchema({
      name: PROTEST_POSITION_TABLE,
      columns: [
        { name: 'session_id', type: 'string', isIndexed: true },
        { name: 'lat', type: 'number' },
        { name: 'lng', type: 'number' },
        { name: 'accuracy', type: 'number', isOptional: true },
        { name: 'recorded_at', type: 'number' },
        // Flipped once the batch holding this point is stored server-side,
        // never on enqueue.
        { name: 'synced', type: 'boolean' },
      ],
    }),
  ],
});
