import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../providers/AuthProvider';
import {
  readRemoteSessions,
  type ProtestDataSource,
  type ReadSession,
} from '../../lib/protestMode/readSession';

/**
 * Recordings read back from the server and decrypted on this device.
 *
 * Its own query key rather than one from `libs/query-client`: what this
 * returns is not an API response. The route only hands over ciphertext, and
 * the plaintext exists solely here, so the key belongs with the decryption,
 * not with the endpoint.
 *
 * Never persisted - `ReactQueryProvider`'s allowlist doesn't cover this
 * prefix, and it must not: decrypted trajectories on disk would undo the
 * whole point of encrypting them.
 */
export const remoteProtestSessionsKey = (userId: string | undefined) =>
  ['protest-mode', 'remote-sessions', userId ?? ''] as const;

/** `source` reads someone else's recordings. Their id is part of the query
 * key, so the two never share a cache entry. */
export const useRemoteProtestSessions = (
  source?: ProtestDataSource,
): {
  sessions: ReadSession[];
  isLoading: boolean;
  failed: boolean;
} => {
  const { user } = useAuth();
  const userId = source?.ownerUserId ?? user?.id;

  const { data, isLoading, isError } = useQuery({
    queryKey: remoteProtestSessionsKey(userId),
    queryFn: () => readRemoteSessions(userId!, source?.dek),
    enabled: !!userId,
    // Decrypting every blob is not free, and recordings don't change behind
    // the app's back - only this device appends to them.
    staleTime: 5 * 60 * 1000,
  });

  return { sessions: data ?? [], isLoading, failed: isError };
};
