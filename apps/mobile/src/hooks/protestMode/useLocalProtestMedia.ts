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
): { audio: ReadAudioChunk[]; video: ReadVideoChunk[] } => {
  const { user } = useAuth();
  const userId = user?.id;

  const { data } = useQuery({
    queryKey: localProtestMediaKey(sessionId ?? ''),
    queryFn: () => readLocalMediaChunks(userId!, sessionId!),
    enabled: !!userId && !!sessionId && !source,
    staleTime: 30 * 1000,
  });

  return { audio: data?.audio ?? [], video: data?.video ?? [] };
};
