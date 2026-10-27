import type { MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { View } from 'react-native';
import { PADDING_HORIZONTAL, PADDING_VERTICAL } from '../../theme/globals';
import { SegmentedControl } from './SegmentedControl';

export const SegmentedControlTabBar = ({
  state,
  descriptors,
  emitter,
  navigateToTab,
}: MaterialTopTabBarProps) => {
  const onPressTab = (item: (typeof state.routes)[number], index: number, isFocused: boolean) => {
    const event = emitter.emit({
      type: 'tabPress',
      target: item.key,
      canPreventDefault: true,
    });

    if (!isFocused && !event.defaultPrevented) {
      navigateToTab(item.key);
    }
  };
  return (
    <View
      style={{
        paddingHorizontal: PADDING_HORIZONTAL,
        paddingBottom: PADDING_VERTICAL,
      }}
    >
      <SegmentedControl
        values={state.routes.map((option: (typeof state.routes)[number]) => {
          const { options } = descriptors[option.key];
          const label =
            options.tabBarLabel !== undefined && typeof options.tabBarLabel === 'string'
              ? options.tabBarLabel
              : options.title !== undefined
                ? options.title
                : option.name;
          return label;
        })}
        selectedIndex={state.index}
        onChange={(event) =>
          onPressTab(
            state.routes[event.nativeEvent.selectedSegmentIndex],
            event.nativeEvent.selectedSegmentIndex,
            false,
          )
        }
      />
    </View>
  );
};
