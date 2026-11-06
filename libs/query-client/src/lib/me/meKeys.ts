export const meKeys = {
  base: 'me' as const,

  details: () => [meKeys.base] as const,
  /** Things waiting for the caller's own approval - a pending sibling device,
   * or a recovery request where they're the trusted contact. One inbox, not
   * one query per kind, so a third kind needs no new key. */
  pendingActions: () => [meKeys.base, 'pending-actions'] as const,
};
