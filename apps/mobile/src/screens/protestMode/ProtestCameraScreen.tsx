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
  captureClip,
  recordingOptions,
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
  const startedAtRef = useRef<Date | null>(null);
  const durationRef = useRef(0);

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

  const start = useCallback(async () => {
    if (!userId || !sessionId) return;
    const startedAt = new Date();
    startedAtRef.current = startedAt;
    durationRef.current = 0;
    setElapsed(0);
    // Not `recording` yet: `recordAsync` returns before the camera has written
    // a frame, and the first progress event is the only signal that it has.
    setPhase('starting');

    try {
      let recorded;
      try {
        recorded = await camera.current?.recordAsync(recordingOptions(hevcAvailable));
      } catch (error) {
        if (!hevcAvailable) throw error;
        logger.error('protest: HEVC is unavailable, recording h264 instead', { error });
        hevcAvailable = false;
        recorded = await camera.current?.recordAsync(recordingOptions(false));
      }
      if (!recorded?.uri) return;

      // The recording itself is over the moment `recordAsync` resolves. What
      // follows is the seal, and it is slow enough to need saying so: the
      // whole clip is read into memory and encrypted in JS.
      setPhase('saving');

      await captureClip({
        userId,
        sessionId,
        recordedUri: recorded.uri,
        startedAt,
        // The recorder's own count where it arrived, because the wall clock
        // also counts the moment spent finalising the file.
        durationMs: durationRef.current || Date.now() - startedAt.getTime(),
      });
    } catch (error) {
      logger.error('protest: a video clip was lost', { error });
    } finally {
      setPhase('idle');
    }
  }, [sessionId, userId]);

  const stop = useCallback(() => void camera.current?.stopRecording(), []);

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
            setElapsed(duration);
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
