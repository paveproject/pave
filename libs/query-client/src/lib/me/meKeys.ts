export const meKeys = {
  base: 'me' as const,

  details: () => [meKeys.base] as const,
  /** The current user's own registered devices (see `PUT/GET /me/devices`). */
  devices: () => [meKeys.base, 'devices'] as const,
  /** Things waiting for the current user's own approval - a pending
   * sibling device, or a recovery request where they're a trusted contact
   * (see `GET /me/pending-actions`). One scalable inbox, not one query
   * per kind, so a future third kind needs no new key here either. */
  pendingActions: () => [meKeys.base, 'pending-actions'] as const,
};
