import { isAndroid } from '../../platform/detection';
import { useTheme } from '../../providers/ThemeProvider';
import {
  TrueSheet as RNTrueSheet,
  TrueSheetProps as RNTrueSheetProps,
} from '@lodev09/react-native-true-sheet';
import { forwardRef } from 'react';
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface TrueSheetProps extends RNTrueSheetProps {
  lightColor?: string;
  darkColor?: string;
}

const TrueSheet = forwardRef<React.ComponentRef<typeof RNTrueSheet>, TrueSheetProps>(
  ({ backgroundColor, style, detents, children, ...props }, ref) => {
    const { colors, isLiquidGlassAvailable } = useTheme();
    const insets = useSafeAreaInsets();
    return (
      <RNTrueSheet
        ref={ref}
        detents={detents || (props.scrollable && isAndroid) ? [0.33, 1] : ['auto']}
        backgroundColor={
          backgroundColor || (!isLiquidGlassAvailable ? colors.background : undefined)
        }
        style={[{ paddingBottom: Platform.OS === 'android' ? insets.bottom : 0 }, style]}
        {...props}
      >
        {children}
      </RNTrueSheet>
    );
  },
);
TrueSheet.displayName = 'TrueSheet';

export { TrueSheetProps };

export default TrueSheet;
