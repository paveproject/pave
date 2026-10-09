import { View } from './view';
import tw from '../../lib/tw';
import { useTheme } from '../../providers/ThemeProvider';
import { BORDER_RADIUS_FULL } from '../../theme/globals';
import Animated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';
import { StyleProp, ViewStyle } from 'react-native';

interface ProgressBarProps {
  progress: SharedValue<number>;
  color?: string;
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
}

export const ProgressBar = ({ progress, color, trackColor, style }: ProgressBarProps) => {
  const { colors } = useTheme();

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value}%`,
  }));

  return (
    <View
      style={[
        tw`w-full h-2 overflow-hidden`,
        { borderRadius: BORDER_RADIUS_FULL, backgroundColor: trackColor ?? colors.muted },
        style,
      ]}
    >
      <Animated.View
        style={[
          tw`h-full`,
          { borderRadius: BORDER_RADIUS_FULL, backgroundColor: color ?? colors.accentYellow },
          fillStyle,
        ]}
      />
    </View>
  );
};
