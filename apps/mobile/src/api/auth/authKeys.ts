export const authKeys = {
  base: 'auth' as const,

  customerInfo: () => [authKeys.base, 'customerInfo'] as const,
};
