import { Platform } from 'react-native';
import type { CameraRecordingOptions, VideoQuality } from 'expo-camera';
import { claimSegmentFile, sealChunk } from './protestMedia';
import { recordMediaChunk } from '../watermelon/protestSessions';

/**
 * 720p, and not lower.
 *
 * The footage has to be worth something to an investigation, which means
 * pixels on the subject. Video-surveillance practice (EN 62676-4) asks for
 * roughly 250 px per metre of scene width to *identify* a person and 125 to
 * *recognise* one. A phone's main camera covers about 1.35 m of width per
 * metre of distance, so 1280 px across gives ~950/d px per metre at distance
 * d: identification out to about 4 m, recognition to about 8 m. At 480p that
 * collapses to 2.5 m, which is closer than most of what matters happens.
 */
export const VIDEO_QUALITY: VideoQuality = '720p';

/**
 * Where the storage is actually won: a 720p clip at the camera's own default
 * runs 6-10 Mbps, and a protest's worth of that fills a bucket.
 *
 * HEVC needs about half the bitrate of h264 for the same picture, and iOS is
 * the only side that lets us ask for it - `codec` is iOS-only, so Android
 * records h264 and has to be given the headroom instead.
 */
const VIDEO_BITRATE_HEVC = 1_200_000;
const VIDEO_BITRATE_H264 = 2_000_000;

export const VIDEO_BITRATE = Platform.OS === 'ios' ? VIDEO_BITRATE_HEVC : VIDEO_BITRATE_H264;

/**
 * A rotation, not a cap on how long you may film.
 *
 * An MP4 keeps its index (`moov`) at the end of the file and the OS writes it
 * only when a recording stops, so nothing can upload before then - a single
 * 20-minute clip is 20 minutes lost to a seizure at minute 19. The blob model
 * is already the unit of upload, and unlike an S3 multipart part a blob is
 * independently *decryptable and playable*, so closing one every two minutes
 * is what turns a long recording into something a seized phone has already
 * sent most of.
 *
 * Two minutes also keeps a segment near 30 MB at the Android bitrate, which
 * is what `MAX_BLOB_BYTES` is sized against.
 */
export const SEGMENT_SECONDS = 120;

const MIME_TYPE = 'video/mp4';

/**
 * `codec` is what makes `videoBitrate` apply at all on iOS - without it the
 * prop is ignored and the clip comes out at the camera's default bitrate.
 * HEVC is unavailable on a handful of older devices and `recordAsync` throws
 * rather than falling back, hence the second form.
 */
export const recordingOptions = (hevc: boolean): CameraRecordingOptions => ({
  maxDuration: SEGMENT_SECONDS,
  ...(Platform.OS === 'ios' ? { codec: hevc ? 'hvc1' : 'avc1' } : {}),
});

/**
 * Moves a just-closed segment out of the camera's own path.
 *
 * Split from `sealSegment` so the next segment can start first: sealing is
 * JS-side crypto over the whole file and takes seconds, where this is a
 * rename. Doing them in one step left the camera off for the length of the
 * encryption.
 */
export const claimSegment = (recordedUri: string, sessionId: string): string =>
  claimSegmentFile(recordedUri, sessionId, 'video');

/**
 * Seals one claimed segment and queues it, in that order.
 *
 * Same contract as an audio segment: the plaintext the camera wrote is gone
 * before this returns, and the row is only a pointer to ciphertext.
 */
export const sealSegment = async (params: {
  userId: string;
  sessionId: string;
  claimedUri: string;
  startedAt: Date;
  durationMs: number;
  /** Frames lost while the camera restarted, before this segment. */
  gapBeforeMs: number;
}): Promise<void> => {
  const sealed = await sealChunk({
    kind: 'video',
    userId: params.userId,
    sessionId: params.sessionId,
    sourceUri: params.claimedUri,
    startedAt: params.startedAt,
    durationMs: params.durationMs,
    gapBeforeMs: params.gapBeforeMs,
    mimeType: MIME_TYPE,
  });
  await recordMediaChunk({
    userId: params.userId,
    sessionId: params.sessionId,
    kind: 'video',
    ...sealed,
  });
};
