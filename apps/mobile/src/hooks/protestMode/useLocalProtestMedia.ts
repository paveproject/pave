import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../providers/AuthProvider';
import { readLocalMediaChunks } from '../../lib/protestMode/readLocalMedia';
import type {
  ProtestDataSource,
  ReadAudioChunk,
  ReadVideoChunk,
} from '../../lib/protestMode/readSession';

/** Never persisted, same reason as the remote read: these are decrypted
 * recordings, and the cache they point at is already more than enough. */
const localProtestMediaKey = (sessionId: string) =>
  ['protest-mode', 'local-media', sessionId] as const;

/**
 * What this device still holds for a session, for the window where an upload
 * has not landed yet.
 *
 * Skipped for someone else's recording: the local rows only ever describe
 * what this account recorded itself.
 */
export const useLocalProtestMedia = (
  sessionId: string | undefined,
  source?: ProtestDataSource,
): {
  audio: ReadAudioChunk[];
  video: ReadVideoChunk[];
  refetch: () => Promise<unknown>;
} => {
  const { user } = useAuth();
  const userId = user?.id;

  const { data, refetch } = useQuery({
    queryKey: localProtestMediaKey(sessionId ?? ''),
    queryFn: () => readLocalMediaChunks(userId!, sessionId!),
    enabled: !!userId && !!sessionId && !source,
    staleTime: 30 * 1000,
    // Required: `onlineManager` is wired to NetInfo, so the default
    // `'online'` mode *pauses* this query while offline and never calls the
    // queryFn - even though it only reads this device's own disk. Offline is
    // precisely when it is the only source there is.
    networkMode: 'always',
  });

  return { audio: data?.audio ?? [], video: data?.video ?? [], refetch };
};
