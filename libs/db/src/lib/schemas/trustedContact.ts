import { relations, sql } from 'drizzle-orm';
import { pgTable, pgEnum, text, timestamp, uuid, index, unique } from 'drizzle-orm/pg-core';
import { user } from './user';

/**
 * Social graph (plus, now, the key material) for the "manif mode" recovery
 * scheme: Shamir's Secret Sharing among trusted contacts, so a user who
 * loses their device can have a quorum of contacts reconstruct their
 * recovery key. `encryptedShare` is sealed client-side to each contact's
 * own public key before it ever reaches this table - the server stores
 * and serves it but never has the means to read it. The actual
 * recovery-request workflow (delay/cancel) that consumes these shares is
 * still a later phase - this table only keeps the relationship and each
 * contact's current share in sync.
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
    // The owner's current Shamir share for this contact, sealed (hex)
    // to the contact's own public key - null until the owner has
    // generated a recovery key and split it across their accepted
    // contacts. Overwritten in place on every rotation (add/remove a
    // contact); no history kept, only the current generation matters.
    // The server stores and serves this but can never read it.
    encryptedShare: text('encrypted_share'),
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
