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
 * A hard stop, not a rotation.
 *
 * An MP4 keeps its index (`moov`) at the end of the file and the OS only
 * writes it when the recording stops, so nothing uploads until then and a
 * clip that never stops is a clip that is never saved. Five minutes bounds
 * what a seizure costs and what one blob weighs (~45 MB at the bitrate
 * above).
 */
export const MAX_CLIP_SECONDS = 300;

const MIME_TYPE = 'video/mp4';

/**
 * `codec` is what makes `videoBitrate` apply at all on iOS - without it the
 * prop is ignored and the clip comes out at the camera's default bitrate.
 * HEVC is unavailable on a handful of older devices and `recordAsync` throws
 * rather than falling back, hence the second form.
 */
export const recordingOptions = (hevc: boolean): CameraRecordingOptions => ({
  maxDuration: MAX_CLIP_SECONDS,
  ...(Platform.OS === 'ios' ? { codec: hevc ? 'hvc1' : 'avc1' } : {}),
});

/**
 * Seals a just-finished clip and queues it, in that order.
 *
 * Same contract as an audio segment: the plaintext the camera wrote is gone
 * before this returns, and the row is only a pointer to ciphertext.
 */
export const captureClip = async (params: {
  userId: string;
  sessionId: string;
  recordedUri: string;
  startedAt: Date;
  durationMs: number;
}): Promise<void> => {
  const claimed = claimSegmentFile(params.recordedUri, params.sessionId, 'video');
  const sealed = await sealChunk({
    kind: 'video',
    userId: params.userId,
    sessionId: params.sessionId,
    sourceUri: claimed,
    startedAt: params.startedAt,
    durationMs: params.durationMs,
    mimeType: MIME_TYPE,
  });
  await recordMediaChunk({
    userId: params.userId,
    sessionId: params.sessionId,
    kind: 'video',
    ...sealed,
  });
};
