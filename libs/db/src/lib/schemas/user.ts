import { relations, sql } from 'drizzle-orm';
import { pgTable, text, pgEnum, timestamp, uuid, index, unique } from 'drizzle-orm/pg-core';
import { authUsers } from './auth';
import { supportedLanguages } from './i18n';

export const user = pgTable('user', {
  id: text('id')
    .primaryKey()
    .references(() => authUsers.id, { onDelete: 'cascade' }),
  language: text('language')
    .default('en-US')
    .notNull()
    .references(() => supportedLanguages.language, {
      onUpdate: 'cascade',
      onDelete: 'restrict',
    }),
  usernameUpdatedAt: timestamp('username_updated_at', { withTimezone: true, mode: 'string' }),
  // Null until the user has been shown the post-signup welcome flow.
  welcomedAt: timestamp('welcomed_at', { withTimezone: true, mode: 'string' }),
  // X25519 identity public key (hex), generated on-device and
  // uploaded once - lets another user seal a Shamir share (see
  // `trustedContact.encryptedShare`) so only this user's own device,
  // holding the matching private key, can ever decrypt it. Null until
  // the mobile app has generated a keypair for this user.
  publicKey: text('public_key'),
});

// Notifications
export const pushProviderEnum = pgEnum('push_provider_enum', ['fcm', 'apns']);
export const deviceTypeEnum = pgEnum('device_type_enum', ['web', 'ios', 'android']);
export const pushToken = pgTable(
  'push_token',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull(),
    provider: pushProviderEnum('provider').notNull(),
    token: text('token').notNull(),
    deviceType: deviceTypeEnum('device_type').notNull().default('web'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .$onUpdate(() => sql`now()`)
      .notNull(),
  },
  (table) => [
    index('idx_push_token_user_id').on(table.userId),
    index('idx_push_token_session_id').on(table.sessionId),
    unique('unique_user_token_provider').on(table.userId, table.token, table.provider),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  pushTokens: many(pushToken),
}));

export const pushTokenRelations = relations(pushToken, ({ one }) => ({
  user: one(user, {
    fields: [pushToken.userId],
    references: [user.id],
  }),
}));
