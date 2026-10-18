import { relations, sql } from 'drizzle-orm';
import { pgTable, text, pgEnum, timestamp, uuid, index, unique } from 'drizzle-orm/pg-core';
import { user, deviceTypeEnum } from './user';
import { trustedContact } from './trustedContact';

/**
 * `pending`: just registered, hasn't been approved yet by another already-
 * `active` device or (via a recovery request) a quorum of trusted contacts
 * - see `recoveryRequest.ts`. Never eligible to receive a sealed DEK copy
 * or be treated as a Shamir recipient while in this state (every query that
 * resolves "my devices"/"a contact's devices" for key material must filter
 * to `active` only) - that's the whole point: a device existing in this
 * table is no longer enough on its own to receive key material, unlike the
 * earlier silent-auto-sync behavior this status replaces.
 * `active`: approved (or never needed approval - the very first device on
 * an account with nothing yet to protect goes straight to `active`, see
 * `set_device`).
 */
export const deviceStatusEnum = pgEnum('device_status_enum', ['pending', 'active']);

/**
 * One row per (user, physical device) the recovery-key scheme knows
 * about - replaces an earlier single `user.publicKey` column, which
 * silently broke with 2+ simultaneously-logged-in devices on the same
 * account (a second device's registration would just overwrite the
 * first's key). Uniqueness is on `(userId, publicKey)`, not `sessionId`:
 * the identity keypair is generated once and persisted in
 * `expo-secure-store`, stable across session rotations (re-login, token
 * refresh) the way `sessionId` itself isn't - keying on it would mint an
 * orphaned row on every re-login.
 *
 * `encryptedDek` is a full seal (no Shamir split - this is "you, trusting
 * yourself") of this user's own current recovery key, deposited by
 * whichever of their devices currently holds it in plaintext. Null until
 * a sibling device has caught this one up.
 */
export const device = pgTable(
  'device',
  {
    id: uuid().defaultRandom().primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // Diagnostic only, not the uniqueness key - see doc comment above.
    sessionId: text('session_id').notNull(),
    publicKey: text('public_key').notNull(),
    deviceType: deviceTypeEnum('device_type').notNull().default('web'),
    // Default 'active' only backfills pre-existing rows at migration time -
    // every new insert sets this explicitly (see `deviceStatusEnum`'s own
    // doc comment), never relies on the column default.
    status: deviceStatusEnum('status').notNull().default('active'),
    encryptedDek: text('encrypted_dek'),
    // Coarse (city/country), resolved once from the registering request's
    // IP via a local GeoIP lookup (see `apps/api/src/libs/geoip.rs`) - shown
    // to an approving sibling so a bank-style "new sign-in from Paris,
    // France" prompt is possible, the same idea as Amazon/Google's own
    // device-approval emails. Deliberately not the raw IP itself (never
    // stored at all, discarded right after the lookup) and deliberately
    // nulled out the moment this device is approved (see
    // `devices::handlers::approve_device`) - once trusted, there's no
    // remaining security reason to keep a location on file, so it doesn't
    // linger as a permanent record of where this device first connected
    // from. Approximate by nature (VPNs/carrier NAT can be wildly off) -
    // never treat this as ground truth, only ever label it as such in the UI.
    locationCity: text('location_city'),
    locationCountry: text('location_country'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .$onUpdate(() => sql`now()`)
      .notNull(),
  },
  (table) => [
    index('idx_device_user_id').on(table.userId),
    unique('unique_user_public_key').on(table.userId, table.publicKey),
  ],
);

export const deviceRelations = relations(device, ({ one, many }) => ({
  user: one(user, {
    fields: [device.userId],
    references: [user.id],
  }),
  trustedContactShares: many(trustedContactShare),
}));

/**
 * One of a trusted-contact relationship's Shamir share, sealed for one
 * specific device of that contact - a contact with N devices needs N
 * rows here (redundant copies of the *same* share value; the Shamir
 * split itself stays per-contact, only the sealing target multiplies).
 * Replaces `trustedContact`'s earlier single `encryptedShare` column,
 * which had the same multi-device problem as `user.publicKey` did.
 */
export const trustedContactShare = pgTable(
  'trusted_contact_share',
  {
    id: uuid().defaultRandom().primaryKey(),
    trustedContactId: uuid('trusted_contact_id')
      .notNull()
      .references(() => trustedContact.id, { onDelete: 'cascade' }),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => device.id, { onDelete: 'cascade' }),
    encryptedShare: text('encrypted_share').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' })
      .$onUpdate(() => sql`now()`)
      .notNull(),
  },
  (table) => [
    index('idx_trusted_contact_share_trusted_contact_id').on(table.trustedContactId),
    index('idx_trusted_contact_share_device_id').on(table.deviceId),
    unique('unique_trusted_contact_device').on(table.trustedContactId, table.deviceId),
  ],
);

export const trustedContactShareRelations = relations(trustedContactShare, ({ one }) => ({
  trustedContact: one(trustedContact, {
    fields: [trustedContactShare.trustedContactId],
    references: [trustedContact.id],
  }),
  device: one(device, {
    fields: [trustedContactShare.deviceId],
    references: [device.id],
  }),
}));
