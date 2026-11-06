import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../providers/AuthProvider';
import { readRemoteSession, type ReadSession } from '../../lib/protestMode/readSession';
import { remoteProtestSessionsKey } from './useRemoteProtestSessions';

/**
 * One recording read back from the server and decrypted, for a device that
 * doesn't hold its local rows.
 *
 * Keyed under the same prefix as the list so a sign-out clears both, and for
 * the same reason it is never persisted: plaintext trajectories on disk would
 * undo the point of encrypting them.
 */
export const useRemoteProtestSession = (
  sessionId: string | undefined,
): { session: ReadSession | null; isLoading: boolean } => {
  const { user } = useAuth();
  const userId = user?.id;

  const { data, isLoading } = useQuery({
    queryKey: [...remoteProtestSessionsKey(userId), sessionId ?? ''],
    queryFn: () => readRemoteSession(userId!, sessionId!),
    enabled: !!userId && !!sessionId,
    staleTime: 5 * 60 * 1000,
  });

  return { session: data ?? null, isLoading };
};
