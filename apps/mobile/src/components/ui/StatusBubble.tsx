import type { ComponentType } from 'react';
import { useTheme } from '../../providers/ThemeProvider';
import { View } from './view';

interface StatusBubbleProps {
  color: string;
  iconColor: string;
  icon: ComponentType<{ size?: number; color?: string }>;
}

/**
 * The small colored circle + icon used for inline field status (error in
 * `FormFieldError`, username-availability success next to the input) -
 * pulled out so both stay the exact same size/shape by construction
 * instead of by two copies agreeing to match.
 */
export const StatusBubble = ({ color, iconColor, icon: IconComponent }: StatusBubbleProps) => {
  const { theme } = useTheme();
  const bubbleSize = theme.icons.sizes.sm + theme.spaces.sm;

  return (
    <View
      style={{
        width: bubbleSize,
        height: bubbleSize,
        borderRadius: bubbleSize / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <IconComponent size={theme.icons.sizes.sm} color={iconColor} />
    </View>
  );
};
