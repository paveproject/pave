import { relations, sql } from 'drizzle-orm';
import { pgTable, pgEnum, text, timestamp, uuid, index, unique } from 'drizzle-orm/pg-core';
import { user } from './user';

/**
 * Social graph for the recovery-key scheme: Shamir's Secret Sharing among
 * trusted contacts, so a user who loses every device can have a quorum of
 * contacts reconstruct their recovery key. Each contact's actual sealed
 * share lives in `trustedContactShare` (see `device.ts`) - one row per
 * device of theirs, not a column here, since a contact can have more than
 * one. The actual recovery-request workflow (delay/cancel) that consumes
 * these shares is still a later phase - this table only keeps the
 * relationship itself in sync.
 *
 * Deliberately not a searchable directory: `ownerUserId` generates a short
 * invite code out-of-band (see `invite_code_hash` - only the hash is ever
 * stored, same as an OTP), shares it with the person they trust through
 * whatever channel they already trust, and that person redeems it once.
 * `contactUserId` stays nullable for a future non-app-user contact
 * (invited by phone/email instead) - out of scope for now.
 */
export const trustedContactStatusEnum = pgEnum('trusted_contact_status_enum', [
  'pending',
  'accepted',
  'declined',
  'revoked',
]);

export const trustedContact = pgTable(
  'trusted_contact',
  {
    id: uuid().defaultRandom().primaryKey(),
    ownerUserId: text('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    contactUserId: text('contact_user_id').references(() => user.id, { onDelete: 'cascade' }),
    status: trustedContactStatusEnum('status').notNull().default('pending'),
    inviteCodeHash: text('invite_code_hash').notNull(),
    inviteCodeExpiresAt: timestamp('invite_code_expires_at', {
      withTimezone: true,
      mode: 'string',
    }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .$onUpdate(() => sql`now()`)
      .notNull(),
  },
  (table) => [
    index('idx_trusted_contact_owner_user_id').on(table.ownerUserId),
    index('idx_trusted_contact_contact_user_id').on(table.contactUserId),
    index('idx_trusted_contact_invite_code_hash').on(table.inviteCodeHash),
    unique('unique_owner_contact').on(table.ownerUserId, table.contactUserId),
  ],
);

export const trustedContactRelations = relations(trustedContact, ({ one }) => ({
  owner: one(user, {
    fields: [trustedContact.ownerUserId],
    references: [user.id],
    relationName: 'trustedContactOwner',
  }),
  contact: one(user, {
    fields: [trustedContact.contactUserId],
    references: [user.id],
    relationName: 'trustedContactContact',
  }),
}));
