import { relations, sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  uuid,
  index,
  uniqueIndex,
  unique,
  check,
} from 'drizzle-orm/pg-core';
import { user } from './user';
import { device } from './device';
import { trustedContact } from './trustedContact';

/**
 * A trusted contact asking to read someone else's recordings.
 *
 * The server only ever gated the **ciphertext**, never the key: every accepted
 * contact already holds a Shamir share, so a quorum of them can reconstruct
 * the DEK whatever this table says. Approving is therefore not a vote - a
 * contact approves by re-sealing their own share to the requesting device.
 *
 * `releaseAt` uses `user.dataAccessDelaySeconds`, never
 * `recoveryDelayProtestSeconds`: that one *shortens* during protest mode,
 * which is backwards here - protest mode is when coercion is most likely.
 */
export const dataAccessRequestStatusEnum = pgEnum('data_access_request_status_enum', [
  // Whether a pending request currently *opens* anything is derived from the
  // clock and the approval count, never stored - see `access_state`.
  'pending',
  'refused',
  'failed',
  'cancelled',
  // Redundant with `expiresAt`, and stored anyway: a partial index predicate
  // has to be immutable, so `idx_data_access_request_one_pending_per_pair`
  // cannot ask whether `expires_at` has passed. Left `pending`, an elapsed
  // request held the pair's only slot for good. Written lazily by whichever
  // handler notices (`close_if_expired`).
  'expired',
]);

export const dataAccessRequest = pgTable(
  'data_access_request',
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** Checked in the handler, not here: the relationship can be revoked
     * afterwards and that must not invalidate the row retroactively. */
    requesterUserId: text('requester_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    /** What every approving contact re-seals their share to. Unlike
     * `recoveryRequest.requestingDeviceId`, it belongs to the *contact*. */
    requestingDeviceId: uuid('requesting_device_id')
      .notNull()
      .references(() => device.id, { onDelete: 'cascade' }),
    status: dataAccessRequestStatusEnum('status').notNull().default('pending'),
    releaseAt: timestamp('release_at', { withTimezone: true, mode: 'string' }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    refusedAt: timestamp('refused_at', { withTimezone: true, mode: 'string' }),
    failedAt: timestamp('failed_at', { withTimezone: true, mode: 'string' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .$onUpdate(() => sql`now()`)
      .notNull(),
  },
  (table) => [
    index('idx_data_access_request_owner_user_id').on(table.ownerUserId),
    index('idx_data_access_request_requester_user_id').on(table.requesterUserId),
    // Per *pair*, not per owner: two contacts asking are unrelated requests.
    // "Live" means the stored status, not the clock - see `expired` above.
    uniqueIndex('idx_data_access_request_one_pending_per_pair')
      .on(table.ownerUserId, table.requesterUserId)
      .where(sql`status = 'pending'`),
    // Catches a handler writing `status` without its matching timestamp.
    // `expired` owns none: the moment is already `expires_at`.
    check(
      'check_data_access_request_status_timestamps',
      // `status::text`, not the enum literal: Postgres refuses to reference a
      // freshly-added enum value in the same transaction ("unsafe use of new
      // value") and drizzle runs a migration as one, so adding a value and
      // constraining it together is only possible through the cast.
      sql`
        (status::text = 'pending' AND refused_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL)
        OR (status::text = 'refused' AND refused_at IS NOT NULL AND failed_at IS NULL AND cancelled_at IS NULL)
        OR (status::text = 'failed' AND failed_at IS NOT NULL AND refused_at IS NULL AND cancelled_at IS NULL)
        OR (status::text = 'cancelled' AND cancelled_at IS NOT NULL AND refused_at IS NULL AND failed_at IS NULL)
        OR (status::text = 'expired' AND refused_at IS NULL AND failed_at IS NULL AND cancelled_at IS NULL)
      `,
    ),
    check('check_data_access_request_window', sql`${table.expiresAt} > ${table.releaseAt}`),
    check(
      'check_data_access_request_not_self',
      sql`${table.requesterUserId} <> ${table.ownerUserId}`,
    ),
  ],
);

export const dataAccessRequestRelations = relations(dataAccessRequest, ({ one, many }) => ({
  owner: one(user, {
    fields: [dataAccessRequest.ownerUserId],
    references: [user.id],
  }),
  requester: one(user, {
    fields: [dataAccessRequest.requesterUserId],
    references: [user.id],
  }),
  requestingDevice: one(device, {
    fields: [dataAccessRequest.requestingDeviceId],
    references: [device.id],
  }),
  contacts: many(dataAccessRequestContact),
}));

/**
 * One row per *other* accepted contact, created up front - the requester is
 * never among them. `encryptedShare` is that contact's own share, re-sealed
 * client-side to the requesting device: an envelope the server cannot open.
 */
export const dataAccessRequestContactStatusEnum = pgEnum(
  'data_access_request_contact_status_enum',
  ['pending', 'approved', 'declined'],
);

export const dataAccessRequestContact = pgTable(
  'data_access_request_contact',
  {
    id: uuid().defaultRandom().primaryKey(),
    dataAccessRequestId: uuid('data_access_request_id')
      .notNull()
      .references(() => dataAccessRequest.id, { onDelete: 'cascade' }),
    trustedContactId: uuid('trusted_contact_id')
      .notNull()
      .references(() => trustedContact.id, { onDelete: 'cascade' }),
    status: dataAccessRequestContactStatusEnum('status').notNull().default('pending'),
    encryptedShare: text('encrypted_share'),
    respondedAt: timestamp('responded_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .$onUpdate(() => sql`now()`)
      .notNull(),
  },
  (table) => [
    index('idx_data_access_request_contact_request_id').on(table.dataAccessRequestId),
    index('idx_data_access_request_contact_trusted_contact_id').on(table.trustedContactId),
    unique('unique_data_access_request_contact').on(
      table.dataAccessRequestId,
      table.trustedContactId,
    ),
    // An approval without a share would count towards the quorum while
    // handing the requester nothing to combine.
    check(
      'check_data_access_request_contact_share',
      sql`
        (status = 'approved' AND encrypted_share IS NOT NULL AND responded_at IS NOT NULL)
        OR (status = 'declined' AND responded_at IS NOT NULL)
        OR (status = 'pending' AND encrypted_share IS NULL AND responded_at IS NULL)
      `,
    ),
  ],
);

export const dataAccessRequestContactRelations = relations(dataAccessRequestContact, ({ one }) => ({
  request: one(dataAccessRequest, {
    fields: [dataAccessRequestContact.dataAccessRequestId],
    references: [dataAccessRequest.id],
  }),
  trustedContact: one(trustedContact, {
    fields: [dataAccessRequestContact.trustedContactId],
    references: [trustedContact.id],
  }),
}));
