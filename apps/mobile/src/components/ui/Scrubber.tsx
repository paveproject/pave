import { TextInput, type LayoutChangeEvent, type TextInputProps } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { View } from './view';
import { useTheme } from '../../providers/ThemeProvider';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const TRACK_HEIGHT = 8;
const TRACK_HEIGHT_SCRUBBING = 14;
const GROW_DURATION_MS = 140;
const TOUCH_PADDING = 16;
/** Fixed at the *tallest* the bar ever gets: padding around the track instead
 * would swell with it and push the transport - and every row below it. */
const TRACK_AREA_HEIGHT = TOUCH_PADDING * 2 + TRACK_HEIGHT_SCRUBBING;

const clock = (seconds: number, negative: boolean): string => {
  'worklet';
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${negative ? '-' : ''}${minutes}:${rest < 10 ? '0' : ''}${rest}`;
};

interface ScrubberProps {
  /** Position as 0..1. The owner **must** leave it alone while `isScrubbing`
   * is set, or the finger fights the clock. */
  progress: SharedValue<number>;
  duration: SharedValue<number>;
  isScrubbing: SharedValue<boolean>;
  onSeek: (seconds: number) => void;
}

/**
 * A draggable position bar with elapsed and remaining labels.
 *
 * The labels are `TextInput`s, not `Text`: it is the only text primitive with
 * a native prop Reanimated can set, so they follow a fast drag without a
 * React render. `ProtestModeScreen`'s timer does the same.
 *
 * The touch uses RN's responder props rather than Gesture Handler because in
 * the installed version (3.3) `GestureDetector` is not exported from the
 * package index and its hook API is unreachable - the only ways in are a
 * deprecated builder or a deep internal import.
 */
export const Scrubber = ({ progress, duration, isScrubbing, onSeek }: ScrubberProps) => {
  const { colors, theme } = useTheme();
  const width = useSharedValue(0);

  const trackStyle = useAnimatedStyle(() => ({
    height: withTiming(isScrubbing.get() ? TRACK_HEIGHT_SCRUBBING : TRACK_HEIGHT, {
      duration: GROW_DURATION_MS,
    }),
  }));

  const fillStyle = useAnimatedStyle(() => ({
    width: `${Math.min(100, Math.max(0, progress.get() * 100))}%`,
  }));

  const elapsedProps = useAnimatedProps<TextInputProps>(
    () => ({ text: clock(progress.get() * duration.get(), false) }) as TextInputProps,
  );

  const remainingProps = useAnimatedProps<TextInputProps>(
    () => ({ text: clock(duration.get() * (1 - progress.get()), true) }) as TextInputProps,
  );

  const moveTo = (x: number) => {
    const span = width.get();
    if (span <= 0) return;
    progress.set(Math.min(1, Math.max(0, x / span)));
  };

  const release = () => {
    onSeek(progress.get() * duration.get());
    isScrubbing.set(false);
  };

  const label = {
    flex: 1,
    fontVariant: ['tabular-nums' as const],
    fontSize: theme.fonts.sizes.sm,
    color: colors.mutedForeground,
    padding: 0,
    includeFontPadding: false,
  };

  return (
    <View style={{ gap: theme.spaces.xs }}>
      <View
        onLayout={(event: LayoutChangeEvent) => width.set(event.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(event) => {
          isScrubbing.set(true);
          moveTo(event.nativeEvent.locationX);
        }}
        onResponderMove={(event) => moveTo(event.nativeEvent.locationX)}
        onResponderRelease={release}
        onResponderTerminate={release}
        // A fixed height rather than `hitSlop`: the responder reads
        // `locationX` against this view's own box, and slop would put the
        // origin outside it, so the fraction would start negative.
        style={{ height: TRACK_AREA_HEIGHT, justifyContent: 'center' }}
      >
        <Animated.View
          style={[
            {
              width: '100%',
              overflow: 'hidden',
              borderRadius: theme.border.radius.full,
              backgroundColor: colors.muted,
            },
            trackStyle,
          ]}
        >
          <Animated.View
            style={[
              { height: '100%', borderRadius: theme.border.radius.full },
              { backgroundColor: colors.foreground },
              fillStyle,
            ]}
          />
        </Animated.View>
      </View>

      <View style={{ flexDirection: 'row' }}>
        <AnimatedTextInput
          animatedProps={elapsedProps}
          editable={false}
          scrollEnabled={false}
          underlineColorAndroid="transparent"
          defaultValue={clock(0, false)}
          style={label}
        />
        <AnimatedTextInput
          animatedProps={remainingProps}
          editable={false}
          scrollEnabled={false}
          underlineColorAndroid="transparent"
          defaultValue={clock(0, true)}
          style={[label, { textAlign: 'right' }]}
        />
      </View>
    </View>
  );
};
