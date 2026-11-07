import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  AudioQuality,
  IOSOutputFormat,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
} from 'expo-audio';
import type { RecordingOptions } from 'expo-audio';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useAuth } from './AuthProvider';
import { useProtestSettingsStore } from '../stores/useProtestSettingsStore';
import { claimSegmentFile, sealChunk } from '../lib/protestMode/protestAudio';
import { setPlaybackAudioMode, setRecordingAudioMode } from '../lib/protestMode/audioMode';
import { recordAudioChunk } from '../lib/watermelon/protestSessions';
import { logger } from '../logger';

/**
 * Explicit rather than a `RecordingPresets` entry: `LOW_QUALITY` records 3gp
 * with the amr_nb narrowband codec on Android and m4a on iOS, so the two
 * platforms would hand an export two different containers. Mono at 48 kbps is
 * about 360 KB a minute - intelligible speech, and small enough to land over
 * a bad network before the next segment closes.
 */
const RECORDING_OPTIONS: RecordingOptions = {
  extension: '.m4a',
  sampleRate: 22050,
  numberOfChannels: 1,
  bitRate: 48000,
  isMeteringEnabled: true,
  android: { outputFormat: 'mpeg4', audioEncoder: 'aac' },
  ios: {
    outputFormat: IOSOutputFormat.MPEG4AAC,
    audioQuality: AudioQuality.LOW,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
  web: { mimeType: 'audio/webm', bitsPerSecond: 48000 },
};

const MIME_TYPE = 'audio/m4a';

/** Bars in the waveform. Enough to read a rhythm, few enough that the whole
 * buffer is one shared-value write. */
export const WAVEFORM_BARS = 48;

/** How often a level is sampled into the buffer. ~12 Hz: fast enough to look
 * live, slow enough that `WAVEFORM_BARS` spans a few seconds. */
const METERING_INTERVAL_MS = 80;

/** `metering` is dBFS - 0 is clipping, and anything under this is silence as
 * far as the drawing is concerned. */
const SILENCE_DB = -60;

export type AudioFailure = 'no-permission' | 'error';

interface ProtestAudioValue {
  isRecording: boolean;
  /** Start of the whole audio run, not of the current segment - the UI counts
   * total recorded time. */
  startedAtMs: number | null;
  /** Rolling levels in 0..1, oldest first. Written from JS, read on the UI
   * thread: the waveform must not re-render React twelve times a second. */
  levels: SharedValue<number[]>;
  /** Takes the session to record into: the provider sits above the screen
   * and has no idea which one is open. */
  start: (sessionId: string) => Promise<AudioFailure | null>;
  stop: () => Promise<void>;
}

const ProtestAudioContext = createContext<ProtestAudioValue | null>(null);

/**
 * Audio capture for a protest session, segment by segment.
 *
 * Mounted app-wide rather than on the protest screen: recording has to
 * survive navigating to the map, and a hook in that screen would stop the
 * moment it unmounted.
 *
 * The recorder is rotated on `cloudSyncIntervalSeconds` instead of writing
 * one long file, because the whole point is that a phone seized mid-protest
 * has already uploaded everything up to the last boundary. The cost is a gap
 * of a few tens of milliseconds at each rotation, which each chunk records in
 * its own header (`gapBeforeMs`) rather than papering over.
 */
export const ProtestAudioProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const chunkSeconds = useProtestSettingsStore((state) => state.cloudSyncIntervalSeconds);

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const levels = useSharedValue<number[]>(new Array(WAVEFORM_BARS).fill(0));

  const [isRecording, setIsRecording] = useState(false);
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);

  /** The session being recorded into. In a ref because the rotation timer
   * outlives any render that armed it. */
  const sessionIdRef = useRef<string | null>(null);
  const chunkStartedAtRef = useRef<Date | null>(null);
  const rotationRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const meteringRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  /** Measured across one rotation, so a chunk can admit the silence it lost
   * rather than claiming to continue the previous one. */
  const gapRef = useRef(0);

  const pushLevel = useCallback(
    (db: number | undefined) => {
      const normalised =
        db === undefined ? 0 : Math.max(0, Math.min(1, (db - SILENCE_DB) / -SILENCE_DB));
      // A new array, not a mutation: a shared value only notifies the UI
      // thread when the reference changes.
      levels.set((previous) => [...previous.slice(1), normalised]);
    },
    [levels],
  );

  /** Closes the current segment and opens the next, then seals the closed one
   * - in that order, so the gap is the restart alone and not the encryption
   * that follows it. */
  const rotate = useCallback(
    async (final: boolean): Promise<void> => {
      const sessionId = sessionIdRef.current;
      const startedAt = chunkStartedAtRef.current;
      if (!userId || !sessionId || !startedAt) return;

      const closedAt = Date.now();
      await recorder.stop();
      const recorded = recorder.uri;

      // Claimed before the next segment is prepared: the recorder may reuse
      // its own path, and sealing happens after the restart.
      const claimed = recorded ? claimSegmentFile(recorded, sessionId) : null;

      if (!final) {
        await recorder.prepareToRecordAsync();
        recorder.record();
        gapRef.current = Date.now() - closedAt;
        chunkStartedAtRef.current = new Date();
      }

      if (!claimed) {
        logger.error('protest: the recorder closed a segment with no file', { sessionId });
        return;
      }

      const sealed = await sealChunk({
        userId,
        sessionId,
        sourceUri: claimed,
        startedAt,
        durationMs: closedAt - startedAt.getTime(),
        gapBeforeMs: gapRef.current,
        mimeType: MIME_TYPE,
      });
      await recordAudioChunk({ userId, sessionId, ...sealed });
    },
    [recorder, userId],
  );

  const clearTimers = useCallback(() => {
    clearTimeout(rotationRef.current);
    clearInterval(meteringRef.current);
    rotationRef.current = undefined;
    meteringRef.current = undefined;
  }, []);

  const start = useCallback(
    async (sessionId: string): Promise<AudioFailure | null> => {
      if (!userId) return 'error';
      try {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) return 'no-permission';

        await setRecordingAudioMode();

        sessionIdRef.current = sessionId;
        gapRef.current = 0;
        await recorder.prepareToRecordAsync();
        recorder.record();
        chunkStartedAtRef.current = new Date();
        setStartedAtMs(Date.now());
        setIsRecording(true);
        return null;
      } catch (error) {
        logger.error('protest: failed to start the audio recording', { error });
        return 'error';
      }
    },
    [recorder, userId],
  );

  const stop = useCallback(async (): Promise<void> => {
    clearTimers();
    // Restored even with nothing to close: a reload mid-recording loses the
    // ref but not the native session, which would stay in `playAndRecord`.
    if (!sessionIdRef.current) {
      await setPlaybackAudioMode();
      return;
    }
    try {
      await rotate(true);
    } catch (error) {
      logger.error('protest: failed to close the final audio segment', { error });
    } finally {
      sessionIdRef.current = null;
      chunkStartedAtRef.current = null;
      setIsRecording(false);
      setStartedAtMs(null);
      levels.set(new Array(WAVEFORM_BARS).fill(0));
      await setPlaybackAudioMode();
    }
  }, [clearTimers, rotate, levels]);

  /** Re-armed on every rotation rather than set as an interval: a rotation
   * takes a variable moment, and an interval would drift into overlapping
   * itself on a slow device. */
  useEffect(() => {
    if (!isRecording) return;
    let cancelled = false;

    const arm = () => {
      rotationRef.current = setTimeout(() => {
        rotate(false)
          .catch((error) => logger.error('protest: audio rotation failed', { error }))
          .finally(() => {
            if (!cancelled) arm();
          });
      }, chunkSeconds * 1000);
    };
    arm();

    meteringRef.current = setInterval(() => {
      pushLevel(recorder.getStatus().metering);
    }, METERING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearTimers();
    };
  }, [isRecording, chunkSeconds, rotate, pushLevel, recorder, clearTimers]);

  return (
    <ProtestAudioContext.Provider value={{ isRecording, startedAtMs, levels, start, stop }}>
      {children}
    </ProtestAudioContext.Provider>
  );
};

export const useProtestAudio = (): ProtestAudioValue => {
  const value = useContext(ProtestAudioContext);
  if (!value) throw new Error('useProtestAudio must be used inside a ProtestAudioProvider');
  return value;
};
