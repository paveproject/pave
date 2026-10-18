export const trustedContactsKeys = {
  base: 'trusted-contacts' as const,

  /** Contacts the current user has designated (as owner). */
  mine: () => [trustedContactsKeys.base, 'mine'] as const,
  /**
   * People whose safety net the current user is part of. `deviceId` is
   * part of the key (not just the query function) when given - each
   * row's resolved `encryptedShare` depends on it, so a different device
   * id is a genuinely different query result, not a cache-busting
   * detail. Called with no argument, this returns the shorter, device-
   * agnostic prefix - for `invalidateQueries`/`setQueryData` call sites
   * that mean "every device's copy of this list", not a specific one
   * (an explicit `undefined` 3rd element would NOT prefix-match those).
   */
  asContact: (deviceId?: string) =>
    deviceId === undefined
      ? ([trustedContactsKeys.base, 'as-contact'] as const)
      : ([trustedContactsKeys.base, 'as-contact', deviceId] as const),
  /**
   * The current user's own pending invite - a `GET` that rotates the code
   * on every call (see `generate_invite`'s own doc comment), so this is
   * just invalidated (not read then discarded) the instant its
   * `trusted_contact_accepted` event fires - the next observer refetches
   * and gets a fresh one for free.
   */
  invite: () => [trustedContactsKeys.base, 'invite'] as const,
};
