export const meKeys = {
  base: 'me' as const,

  details: () => [meKeys.base] as const,
  usernameAvailable: (username: string) => [meKeys.base, 'username-available', username] as const,
};
