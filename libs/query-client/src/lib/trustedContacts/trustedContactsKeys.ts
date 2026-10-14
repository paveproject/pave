export const trustedContactsKeys = {
  base: 'trusted-contacts' as const,

  /** Contacts the current user has designated (as owner). */
  mine: () => [trustedContactsKeys.base, 'mine'] as const,
  /** People whose safety net the current user is part of. */
  asContact: () => [trustedContactsKeys.base, 'as-contact'] as const,
  /**
   * The current user's own pending invite - a `GET` that rotates the code
   * on every call (see `generate_invite`'s own doc comment), so this is
   * just invalidated (not read then discarded) the instant its
   * `trusted_contact_accepted` event fires - the next observer refetches
   * and gets a fresh one for free.
   */
  invite: () => [trustedContactsKeys.base, 'invite'] as const,
};
