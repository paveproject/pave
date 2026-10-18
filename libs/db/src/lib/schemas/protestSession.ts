import { relations } from 'drizzle-orm';
import { pgTable, pgEnum, text, timestamp, uuid, integer, index } from 'drizzle-orm/pg-core';
import { user } from './user';

/**
 * One row per protest-mode activation that actually recorded something
 * (sessions are opened lazily on the client - see
 * `apps/mobile/src/lib/watermelon/protestSessions.ts` - not eagerly when
 * protest mode itself turns on). `id` is **client-supplied**: the mobile
 * app creates the session locally first (offline-first, same outbox shape
 * as `reports`) and pushes it whenever it reconnects, so the id has to be
 * the same on both sides from the start - letting the server assign its
 * own would mean reconciling two ids.
 *
 * The server only ever stores opaque encrypted blobs for this feature's
 * actual content (see `protestUpload`) - it cannot read positions or
 * audio. That's the whole point: see the recovery DEK's own doc comment
 * in `recoveryKey/index.ts` (mobile), which already earmarked it for
 * exactly this.
 */
export const protestSession = pgTable(
  'protest_session',
  {
    id: uuid().primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at', { withTimezone: true, mode: 'string' }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('idx_protest_session_owner_user_id').on(table.ownerUserId)],
);

export const protestUploadKindEnum = pgEnum('protest_upload_kind_enum', [
  'position_batch',
  'audio_chunk',
]);

/**
 * One row per uploaded encrypted blob (a batch of location points, or one
 * audio segment) - the blob itself lives in the private S3 bucket under
 * `PROTEST_SESSIONS_FOLDER` (see `apps/api/src/libs/media.rs`), this row
 * is just the queryable metadata pointing at it.
 */
export const protestUpload = pgTable(
  'protest_upload',
  {
    id: uuid().defaultRandom().primaryKey(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => protestSession.id, { onDelete: 'cascade' }),
    kind: protestUploadKindEnum('kind').notNull(),
    s3Key: text('s3_key').notNull(),
    size: integer('size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [index('idx_protest_upload_session_id').on(table.sessionId)],
);

export const protestSessionRelations = relations(protestSession, ({ one, many }) => ({
  owner: one(user, { fields: [protestSession.ownerUserId], references: [user.id] }),
  uploads: many(protestUpload),
}));

export const protestUploadRelations = relations(protestUpload, ({ one }) => ({
  session: one(protestSession, {
    fields: [protestUpload.sessionId],
    references: [protestSession.id],
  }),
}));
