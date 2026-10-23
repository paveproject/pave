import { relations, sql } from 'drizzle-orm';
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './user';

/**
 * A 3rd, independent recovery path alongside the trusted-contacts quorum
 * (`recoveryRequest.ts`): `encryptedDek` is the account's DEK, symmetric-
 * encrypted client-side with a key derived from a 24-word recovery phrase
 * shown once during onboarding - opaque to the server, same as every
 * other sealed envelope in this scheme.
 *
 * `userId` is the literal primary key, not a surrogate `uuid` like
 * `device`/`trustedContact` - this is a genuine 1:1 extension of the user
 * row (one phrase per account, replaced wholesale on regeneration), and
 * nothing else ever references it by id.
 *
 * Unlike the trusted-contacts path, using this one correctly activates a
 * device immediately - no delay, no quorum, since the server can never
 * verify the client actually decrypted this blob correctly. The only
 * safety net is `handlers::get_recovery_key_mnemonic` unconditionally
 * emailing the owner on every fetch, win or lose.
 */
export const recoveryKeyMnemonic = pgTable('recovery_key_mnemonic', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  encryptedDek: text('encrypted_dek').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .$onUpdate(() => sql`now()`)
    .notNull(),
});

export const recoveryKeyMnemonicRelations = relations(recoveryKeyMnemonic, ({ one }) => ({
  user: one(user, {
    fields: [recoveryKeyMnemonic.userId],
    references: [user.id],
  }),
}));
