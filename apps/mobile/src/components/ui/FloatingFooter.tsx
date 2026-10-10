import { ViewProps } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useTheme } from '../../providers/ThemeProvider';
import tw from '../../lib/tw';

interface FloatingFooterProps extends ViewProps {
  defaultFooterHeight?: number;
  height?: SharedValue<number>;
  keyboardAware?: boolean;
  transparent?: boolean;
}

export const FloatingFooter = ({
  defaultFooterHeight,
  children,
  style,
  height,
  keyboardAware = true,
  transparent = true,
  ...props
}: FloatingFooterProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const internalFooterHeight = useSharedValue(0);
  const footerHeight = height || internalFooterHeight;

  const animatedInsetFooterStyle = useAnimatedStyle(() => ({
    height: footerHeight.value,
  }));

  const animatedFooterStyle = useAnimatedStyle(() => {
    const kbHeight = Math.abs(keyboardHeight.value);
    return {
      paddingBottom: (kbHeight > 0 && keyboardAware ? 0 : insets.bottom) + theme.spaces.vertical,
      bottom: keyboardAware ? kbHeight : 0,
    };
  });

  return (
    <>
      {transparent === false && <Animated.View style={animatedInsetFooterStyle} />}
      <Animated.View
        onLayout={(e) => {
          // eslint-disable-next-line react-hooks/immutability, react-compiler/react-compiler -- Reanimated shared value mutation
          footerHeight.value = e.nativeEvent.layout.height;
        }}
        style={[
          tw`absolute bottom-0 flex-row items-center justify-center left-0 right-0`,
          {
            paddingBottom: insets.bottom + theme.spaces.vertical,
            paddingLeft: insets.left + theme.spaces.horizontal,
            paddingRight: insets.right + theme.spaces.horizontal,
            gap: theme.spaces.md,
          },
          style,
          animatedFooterStyle,
        ]}
        {...props}
      >
        {children}
      </Animated.View>
    </>
  );
};
