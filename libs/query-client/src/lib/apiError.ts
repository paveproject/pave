/**
 * A thin, deliberately generic wrapper so a mutation's `onError` can tell
 * "the server rejected this because the thing it targeted is already
 * gone" (404) apart from any other failure - see
 * `me/meMutations.ts`'s `useApproveDeviceMutation`/`useDeclineDeviceMutation`
 * and `recoveryRequests/recoveryRequestsMutations.ts`'s equivalents, all
 * of which target a `/validation/*` screen that - per the user's own
 * explicit request - can no longer be dismissed by swipe/tap-outside,
 * only by a successful approve/decline. Without this, a stale item (the
 * target resolved itself, or was resolved from another device, in the
 * window between this screen rendering and the user tapping a button)
 * would otherwise leave that screen permanently stuck: the mutation
 * fails, nothing removes the item from the pending-actions cache, and
 * there's no other way to close it.
 */
export interface ApiCallError {
  status: number;
  body: unknown;
}

export const toApiCallError = (status: number, body: unknown): ApiCallError => ({ status, body });

export const isNotFoundError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === 404;
