import {
  pgTable,
  pgEnum,
  text,
  uuid,
  integer,
  boolean,
  index,
  uniqueIndex,
  unique,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './user';

/**
 * A protest-mode recording session. The server never sees plaintext: opaque
 * blobs in the private bucket plus the sealed key needed to open them.
 *
 * Two deliberate departures from this schema's conventions:
 *
 * - **No `created_at`**, unlike every other table here: a server-side
 *   timestamp would record when the account was at a protest and for how
 *   long. Timestamps live encrypted inside `metadata`.
 * - **`id` is minted by the client** on both tables, not `defaultRandom()`:
 *   both are written through an outbox that replays on relaunch, and a
 *   client-held id is what makes a replayed write idempotent.
 */
export const protestSession = pgTable(
  'protest_session',
  {
    id: uuid('id').primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    active: boolean('active').notNull().default(true),
    /**
     * This session's own symmetric key, sealed under the account's recovery
     * DEK - never the DEK itself. Removing a trusted contact mints a brand-new
     * DEK (`commitReconciliation`), so blobs encrypted directly under it
     * become unopenable with no error. A per-session key means a rotation
     * re-seals 32 bytes and leaves the data alone.
     */
    sealedKey: text('sealed_key').notNull(),
    metadata: text('metadata').notNull(),
  },
  (table) => [
    index('idx_protest_session_owner_user_id').on(table.ownerUserId),
    // In the database rather than a handler: "close the old one, then insert"
    // is two statements, and a second device racing in between would leave two
    // open sessions pointing at one trajectory.
    uniqueIndex('idx_protest_session_one_active_per_owner')
      .on(table.ownerUserId)
      .where(sql`active`),
  ],
);

export const protestBlobKindEnum = pgEnum('protest_blob_kind_enum', [
  'position_batch',
  'audio_chunk',
  'video_chunk',
]);

export const protestBlob = pgTable(
  'protest_blob',
  {
    id: uuid('id').primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => protestSession.id, { onDelete: 'cascade' }),
    kind: protestBlobKindEnum('kind').notNull(),
    s3Key: text('s3_key').notNull(),
    size: integer('size').notNull(),
    /** Per-session ordering: there is no cleartext timestamp to sort on. */
    seq: integer('seq').notNull(),
  },
  (table) => [
    index('idx_protest_blob_session_id').on(table.sessionId),
    unique('unique_protest_blob_session_seq').on(table.sessionId, table.seq),
  ],
);
