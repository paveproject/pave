export const userKeys = {
  base: ['user'] as const,

  details: ({ userId }: { userId: string }) => [...userKeys.base, userId] as const,
  devices: ({ userId }: { userId: string }) =>
    [...userKeys.details({ userId }), 'devices'] as const,
  protestSessions: ({ userId }: { userId: string }) =>
    [...userKeys.details({ userId }), 'protest-sessions'] as const,
  /** Contacts this user has designated, as owner. */
  trustedContacts: ({ userId }: { userId: string }) =>
    [...userKeys.details({ userId }), 'trusted-contacts'] as const,
  /**
   * The inverse: people whose safety net this user is part of.
   *
   * `deviceId` belongs in the key when given - each row's resolved
   * `encryptedShare` depends on it, so a different device is a genuinely
   * different result. Called without it, this returns the shorter prefix, for
   * call sites that mean "every device's copy of this list" (an explicit
   * `undefined` element would not prefix-match those).
   */
  trustedContactOf: ({ userId, deviceId }: { userId: string; deviceId?: string }) =>
    deviceId === undefined
      ? ([...userKeys.details({ userId }), 'trusted-contact', 'of'] as const)
      : ([...userKeys.details({ userId }), 'trusted-contact', 'of', deviceId] as const),
  /** A `GET` that rotates the code server-side on every call, so this is
   * invalidated rather than read and kept. */
  trustedContactInvite: ({ userId }: { userId: string }) =>
    [...userKeys.details({ userId }), 'trusted-contact', 'invite'] as const,
  /** At most one pending request per account at a time. */
  recoveryRequestCurrent: ({ userId }: { userId: string }) =>
    [...userKeys.details({ userId }), 'recovery-request', 'current'] as const,
  /** The live request a trusted contact has made against this account - what
   * the owner needs on screen to be able to refuse it in time. */
  dataAccessRequestCurrent: ({ userId }: { userId: string }) =>
    [...userKeys.details({ userId }), 'data-access', 'request', 'current'] as const,
};
