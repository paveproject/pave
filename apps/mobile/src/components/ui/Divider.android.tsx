import { StyleSheet } from 'react-native';
import { Host, HorizontalDivider, VerticalDivider } from '@expo/ui/jetpack-compose';
import type { DividerProps } from './Divider';

/**
 * Native Jetpack Compose Divider (HorizontalDivider/VerticalDivider). Both default to filling
 * their main axis (matching real Compose's Modifier.fillMaxWidth()/fillMaxHeight() behavior),
 * so the Host below is sized to full width/height on the matching axis and left to
 * matchContents on the cross axis (i.e. just the divider's own thickness).
 */
export const Divider = ({
  orientation = 'horizontal',
  color,
  thickness = StyleSheet.hairlineWidth,
  style,
}: DividerProps) => {
  const isHorizontal = orientation === 'horizontal';

  return (
    <Host
      matchContents={isHorizontal ? { vertical: true } : { horizontal: true }}
      style={[isHorizontal ? { width: '100%' } : { height: '100%' }, style]}
    >
      {isHorizontal ? (
        <HorizontalDivider thickness={thickness} color={color} />
      ) : (
        <VerticalDivider thickness={thickness} color={color} />
      )}
    </Host>
  );
};
