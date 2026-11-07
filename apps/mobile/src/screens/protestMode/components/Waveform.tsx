import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';
import { View } from '../../../components/ui/view';
import { useTheme } from '../../../providers/ThemeProvider';
import { WAVEFORM_BARS, useProtestAudio } from '../../../providers/ProtestAudioProvider';

const BAR_WIDTH = 3;
const BAR_GAP = 3;
const HEIGHT = 44;
/** Never zero: a bar that disappears in silence reads as a broken recorder
 * rather than a quiet room. */
const MIN_SCALE = 0.08;

/**
 * One bar. Its own component so each gets its own `useAnimatedStyle` and the
 * whole row updates on the UI thread - the levels arrive twelve times a
 * second, which is twelve React renders a second if they go through state.
 */
const Bar = ({ index }: { index: number }) => {
  const { colors } = useTheme();
  const { levels } = useProtestAudio();
  const reducedMotion = useReducedMotion();

  const style = useAnimatedStyle(() => {
    const level = levels.get()[index] ?? 0;
    return { transform: [{ scaleY: Math.max(MIN_SCALE, level) }] };
  });

  return (
    <Animated.View
      style={[
        {
          width: BAR_WIDTH,
          height: HEIGHT,
          borderRadius: BAR_WIDTH / 2,
          backgroundColor: colors.foreground,
        },
        // Scaling rather than animating `height`: a transform stays on the UI
        // thread, a layout property does not.
        reducedMotion ? { transform: [{ scaleY: MIN_SCALE }] } : style,
      ]}
    />
  );
};

const BARS = Array.from({ length: WAVEFORM_BARS }, (_, index) => index);

/** The live input level while audio is recording. Deliberately not a drawing
 * of the recording itself: the audio is encrypted the moment a segment
 * closes, and nothing keeps a decoded copy around to render. */
export const Waveform = () => (
  <View
    accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants"
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: BAR_GAP,
      height: HEIGHT,
    }}
  >
    {BARS.map((index) => (
      <Bar key={index} index={index} />
    ))}
  </View>
);
