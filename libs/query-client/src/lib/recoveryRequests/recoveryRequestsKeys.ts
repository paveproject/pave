export const recoveryRequestsKeys = {
  base: 'recovery-requests' as const,

  /** At most one pending request per owner at a time (see
   * `create_recovery_request`'s own cleanup) - this is what the waiting
   * screen polls, including after a restart where it may have forgotten
   * the request's id but still needs to resume watching it. */
  current: () => [recoveryRequestsKeys.base, 'current'] as const,
  /** Still-sealed shares collected so far - 423s server-side until the
   * mandatory delay passes, see `handlers::list_recovery_request_shares`. */
  shares: (id: string) => [recoveryRequestsKeys.base, id, 'shares'] as const,
};
