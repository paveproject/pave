import { useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dataAccessRequestSharesOptions,
  meDataAccessRequestsOptions,
  userTrustedContactOfOptions,
} from '@libs/query-client';
import type { DataAccessRequestResponse } from '@libs/api-js';
import { useAuth } from '../../providers/AuthProvider';
import { useDeviceId } from '../useDeviceId';
import { combineSharesToDek } from '../../lib/recoveryKey';
import type { ProtestDataSource } from '../../lib/protestMode/readSession';

/** The `protest-mode` prefix is what keeps this off disk: `ReactQueryProvider`
 * only dehydrates `meKeys.base` and `userKeys.base`. A reconstructed DEK in
 * storage would hand a seized device what the quorum exists to withhold. */
const ownerDekKey = (ownerUserId: string, requestId: string, shareCount: number) =>
  ['protest-mode', 'owner-dek', ownerUserId, requestId, shareCount] as const;

/** `setTimeout` takes a signed 32-bit delay; anything larger wraps round and
 * fires immediately, which here would be a refetch loop. */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/** Outside the hook on purpose: `Date.now()` is impure and the
 * react-compiler lint rejects it anywhere in a hook's lexical scope, effect
 * body included. The extra second avoids a rounding tie with the server's own
 * `now >= release_at`. */
const scheduleAt = (isoDate: string, run: () => void) => {
  const due = new Date(isoDate).getTime() - Date.now();
  return setTimeout(run, Math.min(Math.max(due, 0) + 1000, MAX_TIMEOUT_MS));
};

interface OwnerDataAccess {
  /** Terminal requests included: "refused" is what the screen most needs to
   * say. */
  request: DataAccessRequestResponse | null;
  /** Set only once access is open *and* the shares combined. */
  source: ProtestDataSource | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  isRefreshing: boolean;
  /** Access is open but no key came out of it. Distinct from `isLoading`
   * because it never resolves on its own. */
  failedToCombine: boolean;
}

/**
 * The requester side of one owner: the request's state, and once it opens the
 * DEK to read their recordings with.
 *
 * The DEK is reconstructed here and lives in memory only. Deliberately *not*
 * written through `setDek`: a contact reading someone else's recordings must
 * never overwrite their own recovery state.
 */
export const useOwnerDataAccess = (ownerUserId: string | undefined): OwnerDataAccess => {
  const { user } = useAuth();
  const readerUserId = user?.id;
  const deviceId = useDeviceId();
  const queryClient = useQueryClient();

  // Not `/user/{id}/data-access/request/current`: that route is owner-only,
  // and keyed by owner alone it cannot say *which* contact asked. Newest
  // first from the server, so the first match is the live one.
  const {
    data: mine,
    isPending: isLoadingRequest,
    isRefetching,
    refetch,
  } = useQuery(meDataAccessRequestsOptions());
  const request = (mine ?? []).find((row) => row.owner.id === ownerUserId);
  const isOpen = request?.access === 'open';

  // `waiting` becomes `open` at `releaseAt` on the clock alone: no approval
  // lands and the server sends nothing, so the client has to come back and
  // ask, or it sits on "waiting" for ever with the app open.
  const releaseAt = request?.releaseAt;
  const isWaiting = request?.access === 'waiting';
  useEffect(() => {
    if (!releaseAt || !isWaiting) return;
    const timer = scheduleAt(releaseAt, () => {
      queryClient.invalidateQueries({ queryKey: meDataAccessRequestsOptions().queryKey });
    });
    return () => clearTimeout(timer);
  }, [releaseAt, isWaiting, queryClient]);

  const { data: approvedShares, isPending: isLoadingShares } = useQuery(
    dataAccessRequestSharesOptions({ dataAccessRequestId: isOpen ? request.id : undefined }),
  );

  // The share the caller holds for being a trusted contact in the first
  // place.
  const { data: relationships } = useQuery(
    userTrustedContactOfOptions({ userId: readerUserId, deviceId: deviceId ?? undefined }),
  );
  const ownShare = (relationships ?? []).find(
    (row) => row.owner.id === ownerUserId,
  )?.encryptedShare;

  /**
   * Including the caller's own share is what makes the quorum add up, not an
   * optimisation: the server asks a majority of the *other* contacts while
   * the Shamir threshold counts *all* of them, so with one or two contacts the
   * approved shares alone are one short. No duplicate to guard against -
   * `other_accepted_contacts` keeps the requester out of the quorum.
   */
  const shares = useMemo(
    () => [...(ownShare ? [{ encryptedShare: ownShare }] : []), ...(approvedShares ?? [])],
    [ownShare, approvedShares],
  );

  // Spelled out rather than read off the query: react-query reports a
  // *disabled* query as pending, which would leave the screen spinning for
  // ever in the one case worth reporting - access open, nothing to combine.
  const canCombine = isOpen && !!readerUserId && !!ownerUserId && shares.length > 0;

  const { data: dek, isPending } = useQuery({
    // The share count is in the key so a later approval re-combines: a set
    // one short otherwise stays cached as `null` for ever.
    queryKey: ownerDekKey(ownerUserId ?? '', request?.id ?? '', shares.length),
    queryFn: async () => {
      // `readerUserId`, not the owner's: every share is sealed to *this*
      // device's identity key, stored under the caller's id.
      const combined = await combineSharesToDek(readerUserId!, shares);
      return combined?.dek ?? null;
    },
    enabled: canCombine,
    // A given set of shares only ever yields the same DEK.
    staleTime: Infinity,
  });

  const isCombining = canCombine && isPending;

  return {
    request: request ?? null,
    source: dek && ownerUserId ? { ownerUserId, dek } : null,
    isLoading: isLoadingRequest || (isOpen && (isLoadingShares || isCombining)),
    // Not conditioned on there being shares: an empty set is one of the ways
    // to reach "open but no key", and left silent the menu row would just do
    // nothing when tapped.
    failedToCombine: isOpen && !isCombining && !dek,
    refresh: async () => {
      await refetch();
    },
    isRefreshing: isRefetching,
  };
};

/** Addressed the way the routes are: by `trusted_contact` row id, which is
 * what the relationship list hands out. */
export const useTrustedContactDataAccess = (trustedContactId: string | undefined) => {
  const { user } = useAuth();
  const deviceId = useDeviceId();
  const { data: relationships, isPending } = useQuery(
    userTrustedContactOfOptions({ userId: user?.id, deviceId: deviceId ?? undefined }),
  );
  const relationship = (relationships ?? []).find((row) => row.id === trustedContactId);
  const access = useOwnerDataAccess(relationship?.owner.id);

  return {
    ...access,
    relationship: relationship ?? null,
    isLoading: isPending || access.isLoading,
  };
};
