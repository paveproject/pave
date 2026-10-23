import { relations, sql } from 'drizzle-orm';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { user } from './user';

/**
 * One monotonic counter per account, used as a CAS (compare-and-swap)
 * guard around minting a new recovery DEK - see
 * `handlers::reserve_recovery_dek_generation`. Without server-side
 * coordination, two of a user's own active devices reacting to the same
 * event (e.g. a sibling device being removed) can each independently mint
 * a *different* random DEK and seal it to the others, silently diverging
 * - some devices end up decrypting one key, others a different one, with
 * nothing in the data to reveal the split happened. Reserving a
 * generation number first means only one of them ever proceeds; the
 * loser adopts the winner's result instead (`receiveDek`).
 *
 * `userId` is the literal primary key, same reasoning as
 * `recoveryKeyMnemonic.ts` - a genuine 1:1 extension of the user row,
 * nothing else ever references it by id.
 */
export const recoveryDekGeneration = pgTable('recovery_dek_generation', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  generation: integer('generation').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
    .$onUpdate(() => sql`now()`)
    .notNull(),
});

export const recoveryDekGenerationRelations = relations(recoveryDekGeneration, ({ one }) => ({
  user: one(user, {
    fields: [recoveryDekGeneration.userId],
    references: [user.id],
  }),
}));
