import { ColorValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

export interface DividerProps {
  /**
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';
  /** Divider line color. Falls back to each platform's own default divider color when omitted. */
  color?: ColorValue;
  /**
   * Divider thickness. Use `StyleSheet.hairlineWidth` for a single-pixel line.
   * @default StyleSheet.hairlineWidth
   */
  thickness?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Plain React Native fallback — a simple hairline View. Metro swaps this out automatically for
 * Divider.ios.tsx (native SwiftUI Divider) / Divider.android.tsx (native Jetpack Compose
 * HorizontalDivider/VerticalDivider) on their respective platforms — this file only actually
 * renders on other platforms (e.g. web).
 */
export const Divider = ({
  orientation = 'horizontal',
  color,
  thickness = StyleSheet.hairlineWidth,
  style,
}: DividerProps) => {
  const isHorizontal = orientation === 'horizontal';
  return (
    <View
      style={[
        isHorizontal ? { height: thickness, width: '100%' } : { width: thickness, height: '100%' },
        color ? { backgroundColor: color } : undefined,
        style,
      ]}
    />
  );
};
