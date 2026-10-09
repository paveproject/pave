import React from 'react';
import { ScrollView, RefreshControl } from 'react-native';
import tw from '../../lib/tw';
import { PADDING_HORIZONTAL, PADDING_VERTICAL } from '../../theme/globals';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface RefreshableStateContainerProps extends React.ComponentProps<typeof ScrollView> {
  children: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  bottomOffset?: number;
}

export const RefreshableStateContainer = ({
  children,
  onRefresh,
  refreshing = false,
  contentContainerStyle,
  bottomOffset: bottomOffsetProp,
  ...props
}: RefreshableStateContainerProps) => {
  const insets = useSafeAreaInsets();
  const computedBottomOffset = bottomOffsetProp !== undefined ? bottomOffsetProp : insets.bottom;
  return (
    <ScrollView
      contentContainerStyle={[
        tw`flex-grow items-center justify-center`,
        {
          paddingHorizontal: PADDING_HORIZONTAL,
          paddingBottom: computedBottomOffset + PADDING_VERTICAL,
        },
        contentContainerStyle,
      ]}
      alwaysBounceVertical={true}
      refreshControl={
        onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
      }
      {...props}
    >
      {children}
    </ScrollView>
  );
};
