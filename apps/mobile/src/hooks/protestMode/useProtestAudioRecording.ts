import { useCallback, useRef, useState } from 'react';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { File } from 'expo-file-system';
import { useAuth } from '../../providers/AuthProvider';
import { ensureActiveSession } from '../../lib/watermelon/protestSessions';
import { pushAudioChunk } from '../sync/useProtestDataSync';
import { logger } from '../../logger';

// Fixed segments rather than one long recording: if the app/process dies
// mid-recording, only the current segment is lost, not the whole thing -
// and each finished segment uploads as soon as it's ready (see §7). No
// background continuity in this pass - recording stops if the app is
// backgrounded (documented limitation, not silently swallowed).
const SEGMENT_DURATION_MS = 90_000;

export const useProtestAudioRecording = () => {
  const { user } = useAuth();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const stoppingRef = useRef(false);

  const uploadSegment = useCallback(
    async (uri: string, sessionId: string) => {
      if (!user) {
        return;
      }
      try {
        const file = new File(uri);
        const bytes = await file.bytes();
        const uploaded = await pushAudioChunk(user.id, sessionId, bytes);
        // Audio files are large - unlike location points there's no
        // reason to keep this on-device once it's safely uploaded.
        if (uploaded) {
          file.delete();
        }
      } catch (error) {
        logger.error('protest audio segment processing failed', { error });
      }
    },
    [user],
  );

  const rotateSegment = useCallback(async () => {
    const sessionId = sessionIdRef.current;
    if (!sessionId || stoppingRef.current) {
      return;
    }
    await recorder.stop();
    const uri = recorder.uri;
    if (uri) {
      uploadSegment(uri, sessionId);
    }
    await recorder.prepareToRecordAsync();
    recorder.record();
  }, [recorder, uploadSegment]);

  const start = useCallback(async () => {
    if (!user || isRecording) {
      return;
    }
    const permission = await requestRecordingPermissionsAsync();
    if (permission.status !== 'granted') {
      logger.error('microphone permission denied - cannot start protest-mode recording');
      return;
    }
    await setAudioModeAsync({ allowsRecording: true });

    // Attaches to whatever session is already open (e.g. one GPS
    // tracking already started) - only opens a new one if nothing is.
    const session = await ensureActiveSession();
    sessionIdRef.current = session.id;
    stoppingRef.current = false;

    await recorder.prepareToRecordAsync();
    recorder.record();
    setIsRecording(true);

    timerRef.current = setInterval(rotateSegment, SEGMENT_DURATION_MS);
  }, [user, isRecording, recorder, rotateSegment]);

  const stop = useCallback(async () => {
    if (!isRecording) {
      return;
    }
    stoppingRef.current = true;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const sessionId = sessionIdRef.current;
    await recorder.stop();
    const uri = recorder.uri;
    if (uri && sessionId) {
      uploadSegment(uri, sessionId);
    }
    sessionIdRef.current = null;
    setIsRecording(false);
  }, [isRecording, recorder, uploadSegment]);

  return { isRecording, start, stop };
};
