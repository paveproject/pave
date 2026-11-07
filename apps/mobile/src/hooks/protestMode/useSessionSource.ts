import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSession } from '@libs/api-js';
import { useAuth } from '../../providers/AuthProvider';
import { useOwnerDataAccess } from '../dataAccess/useOwnerDataAccess';
import { database } from '../../lib/watermelon/database';
import { PROTEST_SESSION_TABLE } from '../../lib/watermelon/schema';
import type { ProtestSession } from '../../lib/watermelon/models/ProtestSession';
import type { ProtestDataSource } from '../../lib/protestMode/readSession';

/**
 * Who owns a session, by its id alone. Its own key under the never-persisted
 * `protest-mode` prefix - it is only ever a stepping stone to a DEK.
 */
const sessionOwnerKey = (sessionId: string) =>
  ['protest-mode', 'session-owner', sessionId] as const;

type LocalLookup = 'pending' | 'mine' | 'absent';

interface SessionSource {
  /** Undefined for the caller's own recording, where the DEK comes from this
   * device's own store. Null while it cannot be resolved. */
  source: ProtestDataSource | undefined | null;
  isLoading: boolean;
  /** Readable, but no key reaches it - the grant closed, or no share ever
   * landed on this device. */
  noKey: boolean;
  /** No session under that id, as far as this account can tell. */
  notFound: boolean;
}

/**
 * Resolves what it takes to decrypt a session from nothing but its id.
 *
 * This is what lets one route serve both cases. A session id is a
 * client-minted UUID, globally unique, so it identifies a recording without
 * the URL also having to say whose it is - before this, the trusted-contact
 * path carried a `trusted_contact` row id purely so the client could work out
 * which key to reach for.
 *
 * The local database is asked first, and not as an optimisation: a session
 * this device recorded but has not pushed yet does not exist server-side at
 * all, and going to the network for it would report the caller's own
 * recording as missing.
 */
export const useSessionSource = (sessionId: string | undefined): SessionSource => {
  const { user } = useAuth();
  const myUserId = user?.id;
  // Keyed by the id it answered for, rather than reset at the top of the
  // effect: a synchronous `setState` in an effect cascades a second render,
  // and the react-compiler lint rejects it outright.
  const [answered, setAnswered] = useState<{ id: string; result: LocalLookup } | null>(null);
  const local: LocalLookup = answered && answered.id === sessionId ? answered.result : 'pending';

  useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    database
      .get<ProtestSession>(PROTEST_SESSION_TABLE)
      .find(sessionId)
      .then(() => {
        if (!cancelled) setAnswered({ id: sessionId, result: 'mine' });
      })
      .catch(() => {
        // `find` rejects on a missing row - the only way to ask.
        if (!cancelled) setAnswered({ id: sessionId, result: 'absent' });
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  const {
    data: ownerUserId,
    isPending: isLoadingOwner,
    isError,
  } = useQuery({
    queryKey: sessionOwnerKey(sessionId ?? ''),
    queryFn: async () => {
      const {
        data: row,
        error,
        response,
      } = await getSession({ path: { protest_session_id: sessionId! } });
      // 404 covers both "no such session" and "not yours" - the route cannot
      // tell them apart on purpose.
      if (response.status === 404) return null;
      if (error) throw error;
      return row?.ownerUserId ?? null;
    },
    enabled: !!sessionId && local === 'absent',
  });

  const isMine = local === 'mine' || (!!ownerUserId && ownerUserId === myUserId);

  // Skipped entirely for one's own recording: there is no grant to look up,
  // and asking would 404 against one's own account.
  const access = useOwnerDataAccess(isMine ? undefined : (ownerUserId ?? undefined));

  if (!sessionId || local === 'pending') {
    return { source: null, isLoading: true, noKey: false, notFound: false };
  }
  if (isMine) {
    return { source: undefined, isLoading: false, noKey: false, notFound: false };
  }
  if (isLoadingOwner) {
    return { source: null, isLoading: true, noKey: false, notFound: false };
  }
  // An error is not an answer: offline, the session may well exist. Only a
  // 404 - a `null` owner - says it does not.
  if (isError) {
    return { source: null, isLoading: false, noKey: false, notFound: false };
  }
  if (!ownerUserId) {
    return { source: null, isLoading: false, noKey: false, notFound: true };
  }

  return {
    source: access.source ?? null,
    isLoading: access.isLoading,
    noKey: !access.isLoading && !access.source,
    notFound: false,
  };
};
