import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import type { CameraType, CameraView as CameraViewType } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { useAuth } from '../../providers/AuthProvider';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { Button } from '../../components/ui/Button';
import { RecordButton, type RecordPhase } from './components/RecordButton';
import { PinchZoom } from './components/PinchZoom';
import { Icons as LucideIcons } from '../../constants/IconsOld';
import {
  claimSegment,
  recordingOptions,
  sealSegment,
  VIDEO_BITRATE,
  VIDEO_QUALITY,
} from '../../lib/protestMode/protestVideo';
import { logger } from '../../logger';

const clock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

/**
 * One shot, not a per-attempt retry: HEVC is unavailable on a few older
 * devices and `recordAsync` throws instead of falling back, but a blanket
 * retry on any rejection would start a second recording on a real failure.
 */
let hevcAvailable = Platform.OS === 'ios';

/**
 * Films into the open session: one clip, sealed and queued when it stops.
 *
 * Unlike audio, nothing is uploaded while it runs. An MP4 keeps its index at
 * the end of the file and the OS writes it only at the stop, so the bytes
 * already on disk are unplayable until then - there is nothing useful to send
 * early. `MAX_CLIP_SECONDS` is what bounds the loss.
 */
const ProtestCameraScreen = () => {
  const { sessionId } = useLocalSearchParams<{ sessionId: string }>();
  const t = useTranslations();
  const router = useRouter();
  const { colors, theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const camera = useRef<CameraViewType>(null);
  /** Per-segment, written by `onRecordingProgress` and read at its close. */
  const durationRef = useRef(0);
  /** Everything already closed, so the readout counts the whole run rather
   * than restarting at each rotation. */
  const recordedMsRef = useRef(0);
  /** Set by `stop` so a resolved `recordAsync` can be told apart: the promise
   * looks identical whether the user stopped or `maxDuration` elapsed. */
  const stoppingRef = useRef(false);

  const [permission, requestPermission] = useCameraPermissions();
  const [micPermission, requestMicPermission] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [phase, setPhase] = useState<RecordPhase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [zoom, setZoom] = useState(0);
  const [torch, setTorch] = useState(false);

  const userId = user?.id;
  const granted = permission?.granted && micPermission?.granted;
  // The header's two actions are the camera's, not the clip's: leaving
  // mid-recording would lose it, and flipping restarts the capture session.
  const isIdle = phase === 'idle';
  const isRecording = phase === 'recording';

  /** One `recordAsync`, with the HEVC fallback around it. */
  const recordOneSegment = useCallback(async () => {
    try {
      return await camera.current?.recordAsync(recordingOptions(hevcAvailable));
    } catch (error) {
      if (!hevcAvailable) throw error;
      logger.error('protest: HEVC is unavailable, recording h264 instead', { error });
      hevcAvailable = false;
      return camera.current?.recordAsync(recordingOptions(false));
    }
  }, []);

  /**
   * Films until the user stops, closing a segment every `SEGMENT_SECONDS`.
   *
   * The loop exists because `maxDuration` ends the recording rather than
   * splitting it, so without it filming simply stopped on the user mid-event.
   * Each segment is a whole, independently playable blob - which is what lets
   * a long recording have mostly reached the server before a seizure.
   */
  const start = useCallback(async () => {
    if (!userId || !sessionId) return;
    stoppingRef.current = false;
    recordedMsRef.current = 0;
    durationRef.current = 0;
    setElapsed(0);
    // Not `recording` yet: `recordAsync` returns before the camera has written
    // a frame, and the first progress event is the only signal that it has.
    setPhase('starting');

    // Sealing is queued rather than awaited in the loop: it is crypto over the
    // whole segment and would leave the camera off for its duration. The gap
    // then costs only the camera restart, which the next segment records.
    const seals: Promise<void>[] = [];
    let previousEndedAtMs: number | null = null;

    try {
      while (!stoppingRef.current) {
        const startedAt = new Date();
        const gapBeforeMs =
          previousEndedAtMs === null ? 0 : Math.max(0, startedAt.getTime() - previousEndedAtMs);
        durationRef.current = 0;

        const recorded = await recordOneSegment();
        if (!recorded?.uri) break;

        // The recorder's own count, because the wall clock also counts the
        // moment spent finalising the file.
        const durationMs = durationRef.current || Date.now() - startedAt.getTime();
        previousEndedAtMs = startedAt.getTime() + durationMs;
        recordedMsRef.current += durationMs;

        const claimedUri = claimSegment(recorded.uri, sessionId);
        seals.push(
          sealSegment({ userId, sessionId, claimedUri, startedAt, durationMs, gapBeforeMs }).catch(
            (error) => logger.error('protest: a video segment was lost', { error }),
          ),
        );
      }
    } catch (error) {
      logger.error('protest: video recording failed', { error });
    } finally {
      setPhase('saving');
      await Promise.all(seals);
      setPhase('idle');
    }
  }, [recordOneSegment, sessionId, userId]);

  const stop = useCallback(() => {
    stoppingRef.current = true;
    void camera.current?.stopRecording();
  }, []);

  const flip = useCallback(
    () => setFacing((current) => (current === 'back' ? 'front' : 'back')),
    [],
  );

  // Safe at any time, unlike `facing`: both platforms drive the torch and the
  // zoom through the camera's *control*, which does not reconfigure the
  // capture session, so neither interrupts a recording.
  const toggleTorch = useCallback(() => setTorch((current) => !current), []);

  if (!granted) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.spaces.md,
          backgroundColor: colors.background,
          paddingTop: theme.spaces.vertical,
          paddingLeft: insets.left + theme.spaces.horizontal,
          paddingRight: insets.right + theme.spaces.horizontal,
          paddingBottom: insets.bottom + theme.spaces.vertical,
        }}
      >
        <Text style={{ textAlign: 'center' }}>{t('pages.protest_mode.camera.permission')}</Text>
        <Button
          label={t('messages.grant_camera_access')}
          onPress={() => {
            void requestPermission();
            void requestMicPermission();
          }}
        />
        <Button variant="ghost" label={t('messages.cancel')} onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {/* Both header forms, as in `(settings,protest-mode)/_layout.tsx`:
          `unstable_header*Items` renders native bar items where supported,
          `header*` is the RN fallback. Transparent and tinted white because
          the bar sits over the viewfinder, and `defaultScreenOptions` would
          otherwise paint it `colors.background`.

          Closing is barred while filming: `recordAsync` only resolves on a
          stop, and unmounting the view instead loses the clip entirely. */}
      <Stack.Screen
        options={{
          headerTransparent: true,
          headerStyle: { backgroundColor: 'transparent' },
          headerTintColor: '#fff',
          headerTitle: isRecording ? clock(elapsed) : '',
          headerLeft: () => (
            <Button
              variant="ghost"
              size="icon"
              icon={LucideIcons.X}
              disabled={!isIdle}
              onPress={() => router.back()}
              accessibilityLabel={t('messages.cancel')}
            />
          ),
          unstable_headerLeftItems: () => [
            {
              type: 'button' as const,
              label: t('messages.cancel'),
              onPress: () => router.back(),
              disabled: !isIdle,
              tintColor: '#fff',
              icon: { name: 'xmark', type: 'sfSymbol' as const },
            },
          ],
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spaces.sm }}>
              <Button
                variant="ghost"
                size="icon"
                icon={torch ? LucideIcons.Torch : LucideIcons.TorchOff}
                onPress={toggleTorch}
                accessibilityLabel={t('pages.protest_mode.camera.torch')}
              />
              <Button
                variant="ghost"
                size="icon"
                icon={LucideIcons.SwitchCamera}
                disabled={!isIdle}
                onPress={flip}
                accessibilityLabel={t('pages.protest_mode.camera.flip')}
              />
            </View>
          ),
          unstable_headerRightItems: () => [
            {
              type: 'button' as const,
              label: t('pages.protest_mode.camera.torch'),
              onPress: toggleTorch,
              tintColor: '#fff',
              icon: {
                name: torch ? 'flashlight.on.fill' : 'flashlight.off.fill',
                type: 'sfSymbol' as const,
              },
            },
            {
              type: 'button' as const,
              label: t('pages.protest_mode.camera.flip'),
              onPress: flip,
              disabled: !isIdle,
              tintColor: '#fff',
              icon: { name: 'arrow.triangle.2.circlepath.camera', type: 'sfSymbol' as const },
            },
          ],
        }}
      />
      <PinchZoom zoom={zoom} onZoom={setZoom}>
        <CameraView
          ref={camera}
          style={{ flex: 1 }}
          mode="video"
          facing={facing}
          zoom={zoom}
          enableTorch={torch}
          videoQuality={VIDEO_QUALITY}
          videoBitrate={VIDEO_BITRATE}
          onRecordingProgress={({ duration }) => {
            durationRef.current = Math.round(duration * 1000);
            setElapsed(recordedMsRef.current / 1000 + duration);
            setPhase((current) => (current === 'starting' ? 'recording' : current));
          }}
        />
      </PinchZoom>

      <View
        style={{
          position: 'absolute',
          bottom: insets.bottom + theme.spaces.xl,
          left: 0,
          right: 0,
          alignItems: 'center',
        }}
      >
        <RecordButton
          phase={phase}
          label={t(
            isRecording ? 'pages.protest_mode.camera.stop' : 'pages.protest_mode.camera.start',
          )}
          onPress={isRecording ? stop : () => void start()}
        />
      </View>
    </View>
  );
};

export default ProtestCameraScreen;
