import { useCallback, useEffect, useMemo, useState } from 'react';
import { useObservable, type Subscribable } from '../useObservable';
import { database } from '../../lib/watermelon/database';
import { PROTEST_SESSION_TABLE } from '../../lib/watermelon/schema';
import { observePositions } from '../../lib/watermelon/protestSessions';
import { useRemoteProtestSession } from './useRemoteProtestSession';
import { useLocalProtestMedia } from './useLocalProtestMedia';
import type { ProtestSession } from '../../lib/watermelon/models/ProtestSession';
import type { ProtestPosition } from '../../lib/watermelon/models/ProtestPosition';
import type {
  ProtestDataSource,
  ReadAudioChunk,
  ReadVideoChunk,
} from '../../lib/protestMode/readSession';
import type { TracePoint } from '../../screens/protestMode/components/ProtestTraceMap';
import { logger } from '../../logger';

/** Server first, so an uploaded chunk wins over a stale local file. */
const mergeChunks = <T extends { blobId: string; startedAt: Date }>(
  remote: T[],
  local: T[],
): T[] => {
  const byBlob = new Map(remote.map((chunk) => [chunk.blobId, chunk]));
  for (const chunk of local) {
    if (!byBlob.has(chunk.blobId)) byBlob.set(chunk.blobId, chunk);
  }
  return [...byBlob.values()].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
};

/** The local database has nothing to say about someone else's recording. */
const NEVER_OBSERVABLE: Subscribable<ProtestPosition[]> = {
  subscribe: () => ({ unsubscribe: () => undefined }),
};

/**
 * One session's trajectory, from whichever side holds it.
 *
 * Shared by the detail screen and the full-screen trace, which have to agree
 * on the points down to the frame they fit - they are two views of the same
 * recording, and the remote read is cached, so asking twice costs nothing.
 */
export const useSessionTrace = (id: string | undefined, source?: ProtestDataSource) => {
  const [session, setSession] = useState<ProtestSession | null>(null);

  useEffect(() => {
    if (!id || source) return;
    let cancelled = false;
    database
      .get<ProtestSession>(PROTEST_SESSION_TABLE)
      .find(id)
      .then((row) => {
        if (!cancelled) setSession(row);
      })
      .catch((error) => logger.error('protest: session not found', { id, error }));
    return () => {
      cancelled = true;
    };
  }, [id, source]);

  const getPositions = useCallback(
    () => (source ? NEVER_OBSERVABLE : observePositions(id ?? '')),
    [id, source],
  );
  const local = useObservable<ProtestPosition[]>(getPositions, []);
  // Just this one, by id - no need to pull and decrypt every sibling to show
  // one trajectory.
  const {
    session: remote,
    isLoading: isReadingRemote,
    isRefetching,
    refetch: refetchRemote,
  } = useRemoteProtestSession(id, source);

  // Local wins when it has anything: it is instant, works offline, and is the
  // only side that knows what is still unsent. The server is the fallback for
  // a device that doesn't hold these rows - reinstalled, replaced, or simply
  // not the one that recorded.
  const points: TracePoint[] = useMemo(() => {
    if (local.length > 0) {
      return local.map((row) => ({
        key: row.id,
        lat: row.lat,
        lng: row.lng,
        recordedAt: row.recordedAt,
        synced: row.synced,
      }));
    }
    return (remote?.positions ?? []).map((point, index) => ({
      key: `${point.recordedAt.toISOString()}-${index}`,
      lat: point.lat,
      lng: point.lng,
      recordedAt: point.recordedAt,
      synced: true,
    }));
  }, [local, remote]);

  // A union, not "local wins" like the positions above: a chunk is on disk
  // only until its blob lands, so the two sides describe *different* chunks
  // rather than two copies of the same recording. Deduped on `blobId` all the
  // same, for the window where an upload succeeded but deleting the file
  // afterwards did not.
  const localMedia = useLocalProtestMedia(id, source);
  const audio: ReadAudioChunk[] = useMemo(
    () => mergeChunks(remote?.audio ?? [], localMedia.audio),
    [remote, localMedia.audio],
  );
  const video: ReadVideoChunk[] = useMemo(
    () => mergeChunks(remote?.video ?? [], localMedia.video),
    [remote, localMedia.video],
  );

  // Both sides, because either can be the one holding a chunk: the server
  // for what has uploaded, this device for what has not.
  const refresh = useCallback(async () => {
    await Promise.all([refetchRemote(), localMedia.refetch()]);
  }, [refetchRemote, localMedia]);

  return {
    points,
    audio,
    video,
    refresh,
    isRefreshing: isRefetching,
    startedAt: session?.startedAt ?? remote?.startedAt,
    endedAt: session?.endedAt ?? remote?.endedAt ?? null,
    syncedCount: points.filter((point) => point.synced).length,
    isReadingRemote,
  };
};
