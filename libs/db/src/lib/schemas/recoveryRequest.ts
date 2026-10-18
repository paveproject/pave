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
 * The interactive recovery flow `trustedContact.ts`'s own doc comment
 * anticipates: an owner with no working device of their own left asks a
 * quorum of their trusted contacts to release the Shamir shares they're
 * each already holding, so a brand-new device can reconstruct the DEK.
 *
 * `releaseAt` is the server-enforced half of the mandatory delay - even
 * once every contact has approved, `GET .../shares` refuses to hand back
 * the sealed blobs until this passes. The delay isn't about distinguishing
 * a legitimate re-login from an attacker who stole the account session -
 * the server can't tell those apart - it's a blanket policy applied every
 * time, because the account session is the *only* proof of identity this
 * path has.
 *
 * Starting a request hard-deletes every other device this user has (see
 * `recovery_requests::handlers::create_recovery_request`) - that's what
 * makes "I'm starting a recovery request" *mean* "none of my other
 * devices can help," instead of relying on the user (or the app) to have
 * correctly figured that out in advance. A device that's merely lost or
 * broken, but never explicitly removed, would otherwise sit there forever
 * looking like a viable sync target that can never actually answer.
 */
export const recoveryRequestStatusEnum = pgEnum('recovery_request_status_enum', [
  'pending',
  'completed',
  'cancelled',
  // Server-detectable terminal failure: every asked contact has responded
  // and none approved, so zero shares exist - reconstruction is
  // structurally impossible no matter what Shamir threshold the owner
  // originally split their key into (the server was never told that
  // threshold and still isn't here - this only fires on the one case that
  // doesn't require knowing it: zero approvals can never be enough, since
  // a threshold is always at least one). See
  // `recovery_requests::handlers::fail_if_unrecoverable`.
  'failed',
]);

export const recoveryRequest = pgTable(
  'recovery_request',
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The new, DEK-less device asking for help - what every sealed share
    // ends up re-encrypted to, since it's the only one without the key yet.
    requestingDeviceId: uuid('requesting_device_id')
      .notNull()
      .references(() => device.id, { onDelete: 'cascade' }),
    status: recoveryRequestStatusEnum('status').notNull().default('pending'),
    releaseAt: timestamp('release_at', { withTimezone: true, mode: 'string' }).notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true, mode: 'string' }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'string' }),
    failedAt: timestamp('failed_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .$onUpdate(() => sql`now()`)
      .notNull(),
  },
  (table) => [
    index('idx_recovery_request_owner_user_id').on(table.ownerUserId),
    index('idx_recovery_request_requesting_device_id').on(table.requestingDeviceId),
    // The invariant every handler in `recovery_requests::handlers` relies
    // on - `get_current_recovery_request`, `find_contact_row`, the "cancel
    // my previous pending request" step in `create_recovery_request`
    // itself - was only ever enforced in application code (cancel the old
    // one, *then* insert the new one, as two separate statements, not one
    // transaction). A concurrent `create_recovery_request` racing in
    // between those two statements could otherwise leave two `pending`
    // rows for the same owner. A partial unique index makes that
    // impossible at the database level regardless: at most one `pending`
    // row per `owner_user_id`, full stop - a second one trips a unique
    // violation instead of silently existing.
    uniqueIndex('idx_recovery_request_one_pending_per_owner')
      .on(table.ownerUserId)
      .where(sql`status = 'pending'`),
    // Each terminal status owns exactly one of the three timestamp
    // columns, and `pending` owns none - catches a handler setting
    // `status` without its matching `*At` column (or leaving a stale one
    // set from a previous transition) as a hard DB error instead of a
    // silently inconsistent row. Every status transition in
    // `recovery_requests::handlers` only ever runs from a `pending` row
    // (where all three are already `NULL`), so this always held in
    // practice - this just makes it impossible not to.
    check(
      'check_recovery_request_status_timestamps',
      sql`
        (status = 'pending' AND completed_at IS NULL AND cancelled_at IS NULL AND failed_at IS NULL)
        OR (status = 'completed' AND completed_at IS NOT NULL AND cancelled_at IS NULL AND failed_at IS NULL)
        OR (status = 'cancelled' AND cancelled_at IS NOT NULL AND completed_at IS NULL AND failed_at IS NULL)
        OR (status = 'failed' AND failed_at IS NOT NULL AND completed_at IS NULL AND cancelled_at IS NULL)
      `,
    ),
  ],
);

export const recoveryRequestRelations = relations(recoveryRequest, ({ one, many }) => ({
  owner: one(user, {
    fields: [recoveryRequest.ownerUserId],
    references: [user.id],
  }),
  requestingDevice: one(device, {
    fields: [recoveryRequest.requestingDeviceId],
    references: [device.id],
  }),
  contacts: many(recoveryRequestContact),
}));

/**
 * One row per currently-accepted trusted contact, created up front when
 * the request is made (mirrors how a reconciliation pass always targets
 * *every* eligible contact, not a subset) - gives free "N of M responded"
 * counts with no extra query, and lets a contact who's asked see it in
 * their own list immediately via the realtime fan-out, the same way
 * `trustedContactShare` rows already do for ongoing splits.
 *
 * `encryptedShare` is that contact's own already-held plaintext share,
 * re-sealed client-side to the *requesting device's* public key - still
 * blind to the server, same sealed-envelope convention as everywhere else
 * in this scheme.
 */
export const recoveryRequestContactStatusEnum = pgEnum('recovery_request_contact_status_enum', [
  'pending',
  'approved',
  'declined',
]);

export const recoveryRequestContact = pgTable(
  'recovery_request_contact',
  {
    id: uuid().defaultRandom().primaryKey(),
    recoveryRequestId: uuid('recovery_request_id')
      .notNull()
      .references(() => recoveryRequest.id, { onDelete: 'cascade' }),
    trustedContactId: uuid('trusted_contact_id')
      .notNull()
      .references(() => trustedContact.id, { onDelete: 'cascade' }),
    status: recoveryRequestContactStatusEnum('status').notNull().default('pending'),
    encryptedShare: text('encrypted_share'),
    respondedAt: timestamp('responded_at', { withTimezone: true, mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_recovery_request_contact_recovery_request_id').on(table.recoveryRequestId),
    index('idx_recovery_request_contact_trusted_contact_id').on(table.trustedContactId),
    unique('unique_recovery_request_trusted_contact').on(
      table.recoveryRequestId,
      table.trustedContactId,
    ),
  ],
);

export const recoveryRequestContactRelations = relations(recoveryRequestContact, ({ one }) => ({
  recoveryRequest: one(recoveryRequest, {
    fields: [recoveryRequestContact.recoveryRequestId],
    references: [recoveryRequest.id],
  }),
  trustedContact: one(trustedContact, {
    fields: [recoveryRequestContact.trustedContactId],
    references: [trustedContact.id],
  }),
}));
