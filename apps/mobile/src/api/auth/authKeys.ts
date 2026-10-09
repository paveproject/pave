export const authKeys = {
  base: 'auth' as const,

  session: () => [authKeys.base, 'session'] as const,

  customerInfo: () => [authKeys.base, 'customerInfo'] as const,
};
