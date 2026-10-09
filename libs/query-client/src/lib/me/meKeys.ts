export const meKeys = {
  base: 'me' as const,

  details: () => [meKeys.base] as const,
};
