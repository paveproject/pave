export const utilsKeys = {
  base: 'utils' as const,

  usernameAvailable: (username: string) =>
    [utilsKeys.base, 'username-available', username] as const,
};
