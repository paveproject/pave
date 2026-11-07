import { useCallback } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, TextInput } from 'react-native';
import type { TextInputProps } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOutUp,
  LayoutAnimationConfig,
  LinearTransition,
  useAnimatedProps,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
} from 'react-native-reanimated';
import { Host, Text as NativeText } from '@expo/ui';
import { Shape } from '@expo/ui/jetpack-compose';
import { size } from '@expo/ui/jetpack-compose/modifiers';
import {
  buttonBorderShape,
  buttonStyle,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { LocateFixed, Mic, Video } from 'lucide-react-native';
import type { LucideProps } from 'lucide-react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { useProtestSession } from '../../hooks/protestMode/useProtestSession';
import { useProtestSettingsStore } from '../../stores/useProtestSettingsStore';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { NativeButton } from '../../components/ui/NativeButton';
import { Waveform } from './components/Waveform';
import { useProtestAudio } from '../../providers/ProtestAudioProvider';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const formatElapsed = (sinceMs: number): string => {
  'worklet';
  const total = Math.max(0, Math.floor((Date.now() - sinceMs) / 1000));
  const pad = (value: number) => String(Math.floor(value)).padStart(2, '0');
  return `${pad(total / 3600)}:${pad((total % 3600) / 60)}:${pad(total % 60)}`;
};

/**
 * The running time, driven on the UI thread rather than from React state.
 *
 * `reactCompiler` is on, so a value derived at render from `Date.now()` has no
 * dependency the compiler can see: it memoizes the first result and the clock
 * freezes. A JS interval works but stalls whenever the JS thread is busy.
 *
 * `TextInput`, not `Text`, because it is the only text primitive with a native
 * prop Reanimated can set.
 */
const ElapsedTime = ({ sinceMs, color }: { sinceMs: number; color: string }) => {
  const initial = formatElapsed(sinceMs);
  const text = useSharedValue(initial);

  useFrameCallback(() => {
    const next = formatElapsed(sinceMs);
    // Only on the second boundary: this runs every frame.
    if (next !== text.get()) text.set(next);
  });

  const animatedProps = useAnimatedProps<TextInputProps>(
    () => ({ text: text.get() }) as TextInputProps,
  );

  return (
    <AnimatedTextInput
      animatedProps={animatedProps}
      editable={false}
      scrollEnabled={false}
      underlineColorAndroid="transparent"
      defaultValue={initial}
      accessibilityLabel={initial}
      style={{
        // A `TextInput` has no intrinsic width: inside a centred column it
        // would collapse.
        alignSelf: 'stretch',
        textAlign: 'center',
        fontSize: 56,
        // Without this the digits jitter horizontally every tick.
        fontVariant: ['tabular-nums'],
        color,
        padding: 0,
        includeFontPadding: false,
      }}
    />
  );
};

/** How much of one stream is still on the device. Muted, not destructive:
 * unsent is normal operation - it is in the local database and the sync
 * provider keeps pushing it, so red would read as data loss. */
const PendingBadge = ({
  icon: BadgeIcon,
  count,
  label,
}: {
  icon: React.ComponentType<LucideProps>;
  count: number;
  label: string;
}) => {
  const { colors, theme } = useTheme();

  return (
    <View
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spaces.xs }}
    >
      <BadgeIcon size={theme.icons.sizes.sm} color={colors.mutedForeground} />
      <Text textColor="muted" style={{ fontVariant: ['tabular-nums'] }}>
        {count}
      </Text>
    </View>
  );
};

/** One tool the session puts within reach. Three states carried by the
 * opacity: running, idle, and not available yet - the last one so an upcoming
 * tool reads as coming rather than missing.
 *
 * A tool is not a setting: GPS recording is configured once in
 * `settings/protest-mode` and stays on, so it has no button here. These are
 * the things you reach for *during* a protest. */
const ToolButton = ({
  icon: StreamIcon,
  label,
  hint,
  enabled,
  available,
  onPress,
}: {
  icon: React.ComponentType<LucideProps>;
  label: string;
  hint?: string;
  enabled: boolean;
  available: boolean;
  onPress?: () => void;
}) => {
  const { colors, theme } = useTheme();

  return (
    <Pressable
      onPress={available ? onPress : undefined}
      disabled={!available}
      accessibilityRole="switch"
      accessibilityState={{ checked: enabled, disabled: !available }}
      accessibilityLabel={label}
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spaces.sm,
        paddingVertical: theme.spaces['2xl'],
        paddingHorizontal: theme.spaces.md,
        borderRadius: theme.border.radius.lg,
        backgroundColor: enabled ? colors.secondary : colors.muted,
        opacity: available ? (enabled ? 1 : 0.45) : 0.25,
      }}
    >
      <StreamIcon
        size={theme.icons.sizes.lg}
        color={enabled ? colors.secondaryForeground : colors.mutedForeground}
      />
      <Text style={{ color: enabled ? colors.secondaryForeground : colors.mutedForeground }}>
        {label}
      </Text>
      {hint ? (
        <Text textColor="muted" style={{ fontSize: 11, textAlign: 'center' }}>
          {hint}
        </Text>
      ) : null}
    </Pressable>
  );
};

/** Deliberately large: it gets reached for in a hurry, sometimes without
 * looking at the screen. */
const BUTTON_SIZE = 184;

const ProtestModeScreen = () => {
  const t = useTranslations();
  const { colors, theme, isLiquidGlassAvailable } = useTheme();
  const insets = useSafeAreaInsets();
  const { session, isActive, pendingPositions, pendingAudio, isBusy, start, stop } =
    useProtestSession();
  const gpsEnabled = useProtestSettingsStore((state) => state.gpsEnabled);
  const audio = useProtestAudio();
  const router = useRouter();
  const reducedMotion = useReducedMotion();

  const startedAtMs = session?.startedAt.getTime();

  const label = isActive ? t('pages.protest_mode.stop') : t('pages.protest_mode.start');
  const fill = isActive ? colors.destructive : colors.secondary;
  const onFill = isActive ? colors.destructiveForeground : colors.secondaryForeground;

  const handleStart = useCallback(async () => {
    const failure = await start();
    if (!failure) return;

    const [title, message] =
      failure === 'no-permission'
        ? [
            t('pages.protest_mode.permission_denied_title'),
            t('pages.protest_mode.permission_denied_message'),
          ]
        : failure === 'no-dek'
          ? [t('pages.protest_mode.no_dek_title'), t('pages.protest_mode.no_dek_message')]
          : failure === 'session-conflict'
            ? [t('pages.protest_mode.conflict_title'), t('pages.protest_mode.conflict_message')]
            : failure === 'not-signed-in'
              ? [t('pages.protest_mode.sign_in_required'), undefined]
              : [t('messages.an_error_occurred'), undefined];

    Alert.alert(
      title,
      message,
      failure === 'no-permission'
        ? [
            { text: t('messages.cancel'), style: 'cancel' },
            { text: t('messages.open_settings'), onPress: () => Linking.openSettings() },
          ]
        : undefined,
    );
  }, [start, t]);

  const handleVideo = useCallback(() => {
    if (!session) return;
    router.push({ pathname: '/protest-mode/camera', params: { sessionId: session.id } });
  }, [router, session]);

  const handleAudio = useCallback(async () => {
    if (audio.isRecording) {
      await audio.stop();
      return;
    }
    if (!session) return;

    const failure = await audio.start(session.id);
    if (!failure) return;

    if (failure === 'no-permission') {
      Alert.alert(
        t('pages.protest_mode.microphone_denied_title'),
        t('pages.protest_mode.microphone_denied_message'),
        [
          { text: t('messages.cancel'), style: 'cancel' },
          { text: t('messages.open_settings'), onPress: () => Linking.openSettings() },
        ],
      );
      return;
    }
    Alert.alert(t('messages.an_error_occurred'));
  }, [audio, session, t]);

  const handleStop = useCallback(() => {
    // Says nothing about unsent data, and must not: stopping is not
    // destructive, the capture stays local and the sync provider keeps
    // pushing it. Only a sign-out puts it at risk, and that has its own
    // warning.
    Alert.alert(
      t('pages.protest_mode.stop_confirm_title'),
      t('pages.protest_mode.stop_confirm_message'),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        { text: t('pages.protest_mode.stop'), style: 'destructive', onPress: () => void stop() },
      ],
    );
  }, [t, stop]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView
        bounces={false}
        overScrollMode="never"
        contentContainerStyle={{
          paddingTop: theme.spaces.vertical,
          paddingLeft: insets.left + theme.spaces.horizontal,
          paddingRight: insets.right + theme.spaces.horizontal,
          paddingBottom: insets.bottom + theme.spaces.vertical,
          gap: theme.spaces['2xl'],
        }}
      >
        {/* Only the timer appearing later should move anything, not the whole
            block on mount. */}
        <LayoutAnimationConfig skipEntering>
          <Animated.View
            // Slides the button down instead of jumping when the timer claims
            // the space above it.
            layout={reducedMotion ? undefined : LinearTransition.duration(280)}
            style={{ alignItems: 'center', gap: theme.spaces['2xl'] }}
          >
            {isActive && startedAtMs !== undefined ? (
              <Animated.View
                entering={reducedMotion ? undefined : FadeInUp.duration(260)}
                exiting={reducedMotion ? undefined : FadeOutUp.duration(180)}
                style={{ alignSelf: 'stretch', alignItems: 'center', gap: theme.spaces.xs }}
              >
                <ElapsedTime sinceMs={startedAtMs} color={colors.foreground} />
                {pendingPositions > 0 || pendingAudio > 0 ? (
                  <View style={{ flexDirection: 'row', gap: theme.spaces.md }}>
                    {pendingPositions > 0 ? (
                      <PendingBadge
                        icon={LocateFixed}
                        count={pendingPositions}
                        label={t('pages.protest_mode.sessions.pending', {
                          count: pendingPositions,
                        })}
                      />
                    ) : null}
                    {pendingAudio > 0 ? (
                      <PendingBadge
                        icon={Mic}
                        count={pendingAudio}
                        label={t('pages.protest_mode.sessions.pending', { count: pendingAudio })}
                      />
                    ) : null}
                  </View>
                ) : null}
                {audio.isRecording && audio.startedAtMs !== null ? (
                  <Animated.View
                    entering={reducedMotion ? undefined : FadeInUp.duration(260)}
                    exiting={reducedMotion ? undefined : FadeOutUp.duration(180)}
                    style={{ alignSelf: 'stretch', alignItems: 'center', gap: theme.spaces.xs }}
                  >
                    <Waveform />
                    <Text textColor="muted" style={{ fontVariant: ['tabular-nums'] }}>
                      {t('pages.protest_mode.audio_running')}
                    </Text>
                  </Animated.View>
                ) : null}
              </Animated.View>
            ) : null}

            {/* Size in hard numbers rather than `matchContents`: inside a
                `ScrollView` that measures against an undefined height and
                collapses the native tree to nothing. */}
            <Host style={{ width: BUTTON_SIZE, height: BUTTON_SIZE }}>
              <NativeButton
                disabled={isBusy}
                onPress={isActive ? handleStop : handleStart}
                colors={{ containerColor: fill, contentColor: onFill }}
                iosModifiers={[
                  // 'glassProminent' is iOS 26+ only and @expo/ui silently
                  // drops it below that, leaving a button with no fill.
                  buttonStyle(isLiquidGlassAvailable ? 'glassProminent' : 'borderedProminent'),
                  buttonBorderShape('circle'),
                  tint(fill),
                  foregroundStyle(onFill),
                ]}
                // Called, not JSX: in JSX TypeScript widens the return to
                // `JSX.Element` and loses the branded shape type.
                androidShape={Shape.Circle({})}
                androidModifiers={[size(BUTTON_SIZE, BUTTON_SIZE)]}
              >
                <NativeText
                  textStyle={{
                    fontSize: 20,
                    fontWeight: '600',
                    color: onFill,
                    textAlign: 'center',
                  }}
                  modifiers={
                    // SwiftUI sizes a button from its label, so a frame on the
                    // Button itself is ignored: the label claims the box.
                    Platform.OS === 'ios'
                      ? [frame({ maxWidth: Infinity, maxHeight: Infinity })]
                      : undefined
                  }
                >
                  {label}
                </NativeText>
              </NativeButton>
            </Host>
          </Animated.View>
        </LayoutAnimationConfig>

        {/* Says it rather than recording nothing in silence: with GPS off and
            no tool started, an open session captures nothing at all. */}
        {isActive && !gpsEnabled ? (
          <Text textColor="muted" style={{ textAlign: 'center' }}>
            {t('pages.protest_mode.gps_off_hint')}
          </Text>
        ) : null}

        {/* Only while a session is open: these record *into* one, and a row
            of dead buttons invites tapping them first. */}
        {isActive ? (
          <View style={{ flexDirection: 'row', gap: theme.spaces.md }}>
            <ToolButton
              icon={Mic}
              label={t('pages.protest_mode.audio_recording')}
              enabled={audio.isRecording}
              available
              onPress={handleAudio}
            />
            <ToolButton
              icon={Video}
              label={t('pages.protest_mode.video_recording')}
              enabled={false}
              available
              onPress={handleVideo}
            />
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

export default ProtestModeScreen;
