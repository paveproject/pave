import { Platform } from 'react-native';
import { Slider as SwiftUISlider } from '@expo/ui/swift-ui';
import { Slider as ComposeSlider } from '@expo/ui/jetpack-compose';
import { frame } from '@expo/ui/swift-ui/modifiers';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useTheme } from '../../providers/ThemeProvider';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  /** The increment, in the slider's own units - not a count of steps. */
  step: number;
  onValueChange: (value: number) => void;
}

/**
 * Slider for use *inside* a SwiftUI/Compose tree (a `Host`, a `FieldGroup`).
 *
 * Not `@expo/ui/community/slider`: that one hosts its own native view, so in
 * an existing `Host` tree it overflows its row and receives no touches.
 *
 * Platform-split because the two primitives disagree on what a step is:
 * SwiftUI takes `step` as the increment, Material3 takes `steps` as the
 * *number* of intervals. Passing one to the other silently gives either a
 * continuous slider or an unusable one.
 */
export const Slider = ({ value, min, max, step, onValueChange }: SliderProps) => {
  const { colors } = useTheme();

  if (Platform.OS === 'ios') {
    return (
      <SwiftUISlider
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={onValueChange}
        // Without this SwiftUI sizes to content: a stub of a track.
        modifiers={[frame({ maxWidth: Infinity })]}
      />
    );
  }

  return (
    <ComposeSlider
      value={value}
      min={min}
      max={max}
      // Interior tick count, hence the -1.
      steps={Math.max(0, Math.round((max - min) / step) - 1)}
      onValueChange={onValueChange}
      colors={{ thumbColor: colors.primary, activeTrackColor: colors.primary }}
      modifiers={[fillMaxWidth()]}
    />
  );
};
