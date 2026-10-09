import {
  boolean,
  foreignKey,
  index,
  pgSchema,
  timestamp,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm/relations';

/**
 * Read-only mirror of the `auth` Postgres schema, owned and migrated by the
 * Rust auth service (better-auth-rs - see libs/auth/src/schema.rs), not
 * Drizzle. Generated with `drizzle-kit pull --config=libs/db/drizzle-auth.config.ts`
 * (see that file) - re-run it whenever the Rust side's schema changes, never
 * hand-edit the column lists below.
 *
 * This file is NOT included in the main drizzle.config.ts's `schemaFilter`,
 * so `drizzle-kit generate`/`migrate`/`push` never try to create, alter, or
 * drop these tables - only read/write queries against them.
 */
export const authSchema = pgSchema('auth');

export const authUsers = authSchema.table(
  'users',
  {
    id: varchar().primaryKey().notNull(),
    name: varchar(),
    email: varchar(),
    emailVerified: boolean('email_verified').notNull(),
    image: varchar(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
    username: varchar(),
    displayUsername: varchar('display_username'),
  },
  (table) => [
    uniqueIndex('idx_users_email').using('btree', table.email.asc().nullsLast().op('text_ops')),
    uniqueIndex('idx_users_username').using(
      'btree',
      table.username.asc().nullsLast().op('text_ops'),
    ),
  ],
);

export const authSessions = authSchema.table(
  'sessions',
  {
    id: varchar().primaryKey().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    token: varchar().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
    ipAddress: varchar('ip_address'),
    userAgent: varchar('user_agent'),
    userId: varchar('user_id').notNull(),
    active: boolean().notNull(),
  },
  (table) => [
    index('idx_sessions_expires_at').using(
      'btree',
      table.expiresAt.asc().nullsLast().op('timestamptz_ops'),
    ),
    uniqueIndex('idx_sessions_token').using('btree', table.token.asc().nullsLast().op('text_ops')),
    index('idx_sessions_user_id').using('btree', table.userId.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [authUsers.id],
      name: 'fk_sessions_user_id',
    }).onDelete('cascade'),
  ],
);

export const authAccounts = authSchema.table(
  'accounts',
  {
    id: varchar().primaryKey().notNull(),
    accountId: varchar('account_id').notNull(),
    providerId: varchar('provider_id').notNull(),
    userId: varchar('user_id').notNull(),
    accessToken: varchar('access_token'),
    refreshToken: varchar('refresh_token'),
    idToken: varchar('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', {
      withTimezone: true,
      mode: 'string',
    }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', {
      withTimezone: true,
      mode: 'string',
    }),
    scope: varchar(),
    password: varchar(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [
    uniqueIndex('idx_accounts_provider_id_account_id').using(
      'btree',
      table.providerId.asc().nullsLast().op('text_ops'),
      table.accountId.asc().nullsLast().op('text_ops'),
    ),
    index('idx_accounts_user_id').using('btree', table.userId.asc().nullsLast().op('text_ops')),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [authUsers.id],
      name: 'fk_accounts_user_id',
    }).onDelete('cascade'),
  ],
);

export const authVerifications = authSchema.table(
  'verifications',
  {
    id: varchar().primaryKey().notNull(),
    identifier: varchar().notNull(),
    value: varchar().notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull(),
  },
  (table) => [
    index('idx_verifications_identifier').using(
      'btree',
      table.identifier.asc().nullsLast().op('text_ops'),
    ),
  ],
);

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(authUsers, { fields: [authSessions.userId], references: [authUsers.id] }),
}));

export const authAccountsRelations = relations(authAccounts, ({ one }) => ({
  user: one(authUsers, { fields: [authAccounts.userId], references: [authUsers.id] }),
}));

export const authUsersRelations = relations(authUsers, ({ many }) => ({
  sessions: many(authSessions),
  accounts: many(authAccounts),
}));
