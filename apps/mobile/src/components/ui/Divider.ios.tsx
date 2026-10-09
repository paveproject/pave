import { StyleSheet } from 'react-native';
import { Host, HStack, VStack, Divider as SwiftUIDivider } from '@expo/ui/swift-ui';
import { background, frame } from '@expo/ui/swift-ui/modifiers';
import type { DividerProps } from './Divider';

/**
 * Native SwiftUI Divider. SwiftUI's own Divider auto-adapts its axis to the enclosing stack
 * (horizontal inside a VStack, vertical inside an HStack) — since callers here pass an explicit
 * `orientation` instead, it's wrapped in the matching stack internally so the axis is forced
 * regardless of where this ends up in the RN tree.
 */
export const Divider = ({
  orientation = 'horizontal',
  color,
  thickness = StyleSheet.hairlineWidth,
  style,
}: DividerProps) => {
  const isHorizontal = orientation === 'horizontal';
  const dividerModifiers = [
    frame(isHorizontal ? { height: thickness } : { width: thickness }),
    ...(color ? [background(color)] : []),
  ];

  return (
    <Host
      matchContents={isHorizontal ? { vertical: true } : { horizontal: true }}
      style={[isHorizontal ? { width: '100%' } : { height: '100%' }, style]}
    >
      {isHorizontal ? (
        <VStack modifiers={[frame({ maxWidth: Infinity })]}>
          <SwiftUIDivider modifiers={dividerModifiers} />
        </VStack>
      ) : (
        <HStack modifiers={[frame({ maxHeight: Infinity })]}>
          <SwiftUIDivider modifiers={dividerModifiers} />
        </HStack>
      )}
    </Host>
  );
};
