import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../providers/ThemeProvider';
import { View } from '../ui/view';
import { ProtestModeAccessoryContent } from './ProtestModeAccessoryContent';

// Approximate native tab bar height - `NativeTabs` renders an actual native
// bar (UITabBar / BottomNavigationView), not a JS-measurable `View`, so
// there's no exact height to read the way a JS tab navigator would give via
// `useBottomTabBarHeight`. Needs live visual tuning on a simulator/device;
// this is a starting estimate, not a measured constant.
const TAB_BAR_HEIGHT = Platform.OS === 'ios' ? 49 : 64;

/**
 * Fallback for every platform/OS version without `NativeTabs.BottomAccessory`
 * (iOS 26+ only - see `(tabs)/_layout.tsx`'s own doc comment) - same visual
 * content (`ProtestModeAccessoryContent`), just in a plain absolutely
 * positioned pill sitting just above the tab bar instead of the real native
 * accessory slot.
 */
export const ProtestModeFloatingBar = () => {
  const { theme, colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: insets.bottom + TAB_BAR_HEIGHT + theme.spaces.sm,
        alignItems: 'center',
      }}
    >
      <View
        style={{
          backgroundColor: colors.muted,
          borderRadius: theme.border.radius.full,
          paddingVertical: theme.spaces.sm,
          paddingHorizontal: theme.spaces.md,
        }}
      >
        <ProtestModeAccessoryContent />
      </View>
    </View>
  );
};
