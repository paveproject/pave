export const meKeys = {
  base: 'me' as const,

  details: () => [meKeys.base] as const,
  /** The current user's own registered devices (see `PUT/GET /me/devices`). */
  devices: () => [meKeys.base, 'devices'] as const,
};
