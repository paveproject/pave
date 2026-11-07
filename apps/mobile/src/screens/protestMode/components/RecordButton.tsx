import { useEffect } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { GlassView } from 'expo-glass-effect';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../../providers/ThemeProvider';
import { View } from '../../../components/ui/view';

/** The glass ring. The shape inside is inset by `RING_PADDING`, so the glass
 * stays visible all the way around it rather than being covered. */
const OUTER_SIZE = 78;
const RING_PADDING = 6;

const IDLE_SIZE = OUTER_SIZE - RING_PADDING * 2;
/** Voice Memos and the iOS camera both shrink the shape as they square it -
 * the two together are what read as "armed", not either alone. */
const RECORDING_SIZE = IDLE_SIZE * 0.56;
const RECORDING_RADIUS = 10;
const MORPH_DURATION_MS = 220;

export type RecordPhase = 'idle' | 'starting' | 'recording' | 'saving';

/**
 * Circle to rounded square, and back.
 *
 * `width`/`height`/`borderRadius` are animated rather than a `scale`: under a
 * transform the radius scales with the shape, so a square corner would have
 * to be pre-divided by the scale factor and the two would stay coupled. The
 * ring around it is a fixed size, so animating the leaf's layout moves
 * nothing else.
 */
export const RecordButton = ({
  phase,
  label,
  onPress,
}: {
  phase: RecordPhase;
  label: string;
  onPress: () => void;
}) => {
  const { colors, theme, isLiquidGlassAvailable } = useTheme();
  const reducedMotion = useReducedMotion();
  const squared = useSharedValue(0);

  const isRecording = phase === 'recording';
  // `starting` and `saving` are both the camera, not the user: one waits for
  // the first frame to reach the file, the other for the clip to be encrypted.
  const isBusy = phase === 'starting' || phase === 'saving';

  useEffect(() => {
    const target = isRecording ? 1 : 0;
    squared.set(reducedMotion ? target : withTiming(target, { duration: MORPH_DURATION_MS }));
  }, [isRecording, reducedMotion, squared]);

  const shapeStyle = useAnimatedStyle(() => {
    const size = interpolate(squared.get(), [0, 1], [IDLE_SIZE, RECORDING_SIZE]);
    return {
      width: size,
      height: size,
      borderRadius: interpolate(squared.get(), [0, 1], [IDLE_SIZE / 2, RECORDING_RADIUS]),
    };
  });

  return (
    <Pressable
      onPress={onPress}
      disabled={isBusy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: isBusy, selected: isRecording }}
    >
      <GlassView
        style={{
          width: OUTER_SIZE,
          height: OUTER_SIZE,
          borderRadius: theme.border.radius.full,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isLiquidGlassAvailable ? 'transparent' : colors.muted,
          borderWidth: isLiquidGlassAvailable ? 0 : 1,
          borderColor: isLiquidGlassAvailable ? 'transparent' : colors.border,
        }}
      >
        <Animated.View
          style={[{ backgroundColor: colors.destructive, opacity: isBusy ? 0.4 : 1 }, shapeStyle]}
        />
        {isBusy ? (
          <View style={{ position: 'absolute' }}>
            <ActivityIndicator color={colors.destructiveForeground} />
          </View>
        ) : null}
      </GlassView>
    </Pressable>
  );
};
