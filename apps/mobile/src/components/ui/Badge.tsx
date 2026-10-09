import { useTheme } from '../../providers/ThemeProvider';
import tw from '../../lib/tw';
import * as React from 'react';
import Animated from 'react-native-reanimated';

type Variant = 'default' | 'destructive' | 'outline' | 'accent-yellow';

interface BadgeTextProps extends React.ComponentPropsWithoutRef<typeof Animated.Text> {
  variant?: Variant;
}

const BadgeText = React.forwardRef<React.ComponentRef<typeof Animated.Text>, BadgeTextProps>(
  ({ variant, style, ...props }, ref) => {
    const { colors } = useTheme();
    const variantStyles = React.useMemo(() => {
      const shared = 'text-xs font-medium';
      let style = {};
      switch (variant) {
        case 'destructive':
          style = {
            color: colors.destructiveForeground,
          };
          break;
        case 'outline':
          style = {
            color: colors.foreground,
          };
          break;
        case 'accent-yellow':
          style = {
            color: colors.accentYellowForeground,
          };
          break;
        default:
          style = {
            color: colors.primaryForeground,
          };
      }
      return {
        shared,
        variant: style,
      };
    }, [variant, colors]);
    return (
      <Animated.Text
        ref={ref}
        style={[tw.style(variantStyles.shared), variantStyles.variant, style]}
        {...props}
      />
    );
  },
);
BadgeText.displayName = 'BadgeText';

interface BadgeProps extends React.ComponentPropsWithoutRef<typeof Animated.View> {
  variant?: Variant;
  disabled?: boolean;
  onPress?: () => void;
}

const Badge = React.forwardRef<React.ComponentRef<typeof Animated.View>, BadgeProps>(
  ({ variant, disabled, style, children, ...props }, ref) => {
    const { colors } = useTheme();
    const variantStyles = React.useMemo(() => {
      const shared = 'flex-row items-center justify-center self-start gap-2 rounded-full px-2 py-1';
      let style = {};
      switch (variant) {
        case 'destructive':
          style = {
            backgroundColor: colors.destructive,
          };
          break;
        case 'outline':
          style = {
            backgroundColor: colors.background,
            borderColor: colors.muted,
            borderWidth: 1,
          };
          break;
        case 'accent-yellow':
          style = {
            backgroundColor: colors.accentYellow,
          };
          break;
        default:
          style = {
            backgroundColor: colors.primary,
          };
      }
      return {
        shared,
        variant: style,
      };
    }, [variant, colors]);
    return (
      <Animated.View
        ref={ref}
        style={[tw.style(variantStyles.shared), variantStyles.variant, style]}
        {...props}
      >
        <BadgeText variant={variant} style={tw`text-center`}>
          {children}
        </BadgeText>
      </Animated.View>
    );
  },
);
Badge.displayName = 'Badge';

export { Badge, BadgeText };
export type { BadgeProps, BadgeTextProps };
