import { useQuery } from '@tanstack/react-query';
import { recoveryRequestSharesOptions } from '@libs/query-client';
import type { MeRecoveryRequestsResponse } from '@libs/api-js';
import { peekRecoveryThreshold } from '../../lib/recoveryKey';
import { useAuth } from '../../providers/AuthProvider';

/**
 * Whether an in-flight recovery request has become provably impossible to
 * complete - computed client-side, because only the client ever learns
 * the Shamir threshold (see `recoveryRequest.ts`'s own doc comment on why
 * the server can't, and `peekRecoveryThreshold`'s own on how this reads
 * it). Detects this *before* every contact has responded: the moment
 * `approvedContacts + stillPending < threshold`, no outcome for whoever
 * hasn't answered yet can save it - no need to wait for them to.
 *
 * `threshold` itself is only knowable once at least one share has been
 * approved and released (the mandatory delay still applies - see
 * `recoveryRequestSharesOptions`), so this always reports `false` before
 * that, same blind spot the server has.
 */
export const useRecoveryOutcome = (request: MeRecoveryRequestsResponse | null | undefined) => {
  const { user } = useAuth();
  const requestId = request?.status === 'pending' ? request.id : undefined;

  // Same query key `useRecoveryRequestCompletion` already polls - this
  // just reads whatever it (or this hook, if it mounts first) already
  // fetched, no duplicate network traffic.
  const { data: shares } = useQuery({
    ...recoveryRequestSharesOptions(requestId ?? ''),
    enabled: !!requestId,
  });

  const { data: threshold } = useQuery({
    queryKey: ['recovery-threshold', requestId, shares?.length ?? 0],
    queryFn: () => peekRecoveryThreshold(user!.id, shares!),
    enabled: !!user && !!requestId && !!shares && shares.length > 0,
  });

  if (!request || threshold == null) return { isImpossible: false };

  const stillPending = request.totalContacts - request.approvedContacts - request.declinedContacts;
  const maxPossibleApprovals = request.approvedContacts + stillPending;
  return { isImpossible: maxPossibleApprovals < threshold };
};
