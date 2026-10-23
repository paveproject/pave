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

/** Same "stale local state vs. server truth" reasoning as
 * `isNotFoundError` - `activate_via_recovery_key_mnemonic` 403s when the
 * device is already `active` (a previous attempt already succeeded, but
 * this client's own cache never caught up). The goal state is already
 * true either way, so callers treat this the same as a fresh success. */
export const isForbiddenError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === 403;

/** `reserve_recovery_dek_generation` 409s when another device already
 * won the same reservation - not a failure to retry, a signal to
 * abandon this device's own rotation plan entirely and wait for the
 * winner's result to arrive instead (see
 * `useRecoveryKeySync`/`reserveDekGeneration`'s own doc comment). */
export const isConflictError = (error: unknown): boolean =>
  typeof error === 'object' && error !== null && 'status' in error && error.status === 409;
