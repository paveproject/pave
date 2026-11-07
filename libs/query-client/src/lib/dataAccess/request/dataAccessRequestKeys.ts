export const dataAccessRequestKeys = {
  // Two segments, not one slug: a future `data-access/...` sibling shares the
  // prefix, so the whole domain invalidates in one call.
  base: ['data-access', 'request'] as const,

  details: ({ dataAccessRequestId }: { dataAccessRequestId: string }) =>
    [...dataAccessRequestKeys.base, dataAccessRequestId] as const,
  /** Handed over only once access is open. */
  shares: ({ dataAccessRequestId }: { dataAccessRequestId: string }) =>
    [...dataAccessRequestKeys.details({ dataAccessRequestId }), 'shares'] as const,
};
