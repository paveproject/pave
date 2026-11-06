import type { StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import { View } from './view';
import { Text } from './text';

export type BadgeVariant =
  | 'default'
  | 'secondary'
  | 'muted'
  | 'destructive'
  | 'success'
  | 'warning';

export interface BadgeProps {
  label: string;
  /** @default 'default' */
  variant?: BadgeVariant;
  style?: StyleProp<ViewStyle>;
}

/**
 * Short status pill. Each variant is a token pair, so the label always
 * contrasts with its own fill.
 *
 * Sets no `alignSelf`: it would override the parent's `alignItems` and pin the
 * badge to the top of a row. A *column* parent has to pass
 * `style={{ alignSelf: 'flex-start' }}` to keep it sized to its label.
 */
export const Badge = ({ label, variant = 'default', style }: BadgeProps) => {
  const { colors, theme } = useTheme();

  const { background, foreground } = ((): { background: string; foreground: string } => {
    switch (variant) {
      case 'secondary':
        return { background: colors.secondary, foreground: colors.secondaryForeground };
      case 'muted':
        return { background: colors.muted, foreground: colors.mutedForeground };
      case 'destructive':
        return { background: colors.destructive, foreground: colors.destructiveForeground };
      case 'success':
        return { background: colors.success, foreground: colors.successForeground };
      case 'warning':
        return { background: colors.warning, foreground: colors.warningForeground };
      default:
        return { background: colors.primary, foreground: colors.primaryForeground };
    }
  })();

  return (
    <View
      style={[
        {
          paddingHorizontal: theme.spaces.md,
          paddingVertical: theme.spaces.sm,
          borderRadius: theme.border.radius.full,
          backgroundColor: background,
        },
        style,
      ]}
    >
      <Text style={{ fontSize: theme.fonts.sizes.xs, fontWeight: '600', color: foreground }}>
        {label}
      </Text>
    </View>
  );
};
