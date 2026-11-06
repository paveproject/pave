export const recoveryRequestKeys = {
  base: ['recovery-request'] as const,

  /** Still-sealed shares collected so far - 423s server-side until the
   * mandatory delay passes. */
  shares: ({ recoveryRequestId }: { recoveryRequestId: string }) =>
    [...recoveryRequestKeys.base, recoveryRequestId, 'shares'] as const,
};
