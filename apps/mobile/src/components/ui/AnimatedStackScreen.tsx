import { Stack } from 'expo-router';
import { forwardRef, useCallback, useMemo } from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';
import Animated, { SharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { Button } from './Button';
import { Icons } from '../../constants/Icons';
import { HeaderTitle, HeaderTitleProps } from 'expo-router/react-navigation';
import { useTheme } from '../../providers/ThemeProvider';
import { LinearGradient } from 'expo-linear-gradient';
import Color from 'color';

export interface AnimatedStackScreenProps extends React.ComponentProps<typeof Stack.Screen> {
  scrollY: SharedValue<number>;
  triggerHeight: SharedValue<number>;
  onMenuPress?: () => void;
  options: React.ComponentProps<typeof Stack.Screen>['options'] & {
    headerReplaceBackground?: boolean;
  };
  /**
   * The ratio at which the animation should start.
   * 0.0 = Start from first scroll position
   * 0.8 = Start from 80% of the scroll position
   * @default 0.25
   */
  animationStartRatio?: number;
  /**
   * The ratio at which the scale animation should start.
   * 0.0 = Start from no scale
   * 0.8 = Start from 80% of the scale
   * @default 0.90
   */
  scaleStartRatio?: number;
  disabledTitleAnimation?: boolean;
}

const ReanimatedHeaderTitle = Animated.createAnimatedComponent(HeaderTitle);

const AnimatedStackScreen = forwardRef<
  React.ComponentRef<typeof Stack.Screen>,
  AnimatedStackScreenProps
>(
  (
    {
      onMenuPress,
      scrollY,
      triggerHeight,
      animationStartRatio = 0.25,
      scaleStartRatio = 0.9,
      disabledTitleAnimation = false,
      ...props
    },
    ref,
  ) => {
    const { colors, isLiquidGlassAvailable } = useTheme();
    const defaultOptions = useMemo(
      () => ({
        headerTransparent: true,
      }),
      [],
    );

    const { headerReplaceBackground, headerBackground, headerTitle, ...options } = useMemo(
      () => ({
        ...defaultOptions,
        ...(typeof props.options === 'object' ? props.options : {}),
      }),
      [defaultOptions, props.options],
    );

    const titleAnimatedStyle = useAnimatedStyle(() => {
      'worklet';
      const show = triggerHeight.value === 0 ? false : scrollY.value >= triggerHeight.value;
      return {
        opacity: withTiming(show ? 1 : 0, { duration: 200 }),
        transform: [
          { scale: withTiming(show ? 1 : scaleStartRatio, { duration: 200 }) },
          { translateY: withTiming(show ? 0 : -10, { duration: 200 }) },
        ],
      };
    });
    const backgroundAnimatedStyle = useAnimatedStyle(() => {
      'worklet';
      const show = triggerHeight.value === 0 ? false : scrollY.value >= triggerHeight.value;
      return {
        opacity: withTiming(show ? 1 : 0, { duration: 200 }),
        transform: [{ translateY: withTiming(show ? 0 : -10, { duration: 200 }) }],
      };
    });
    const getBackgroundColor = useCallback((style: StyleProp<ViewStyle>) => {
      if (!style) return undefined;
      if (Array.isArray(style)) {
        for (const s of style) {
          if (
            s &&
            typeof s === 'object' &&
            'backgroundColor' in s &&
            typeof s.backgroundColor === 'string'
          ) {
            return s.backgroundColor;
          }
        }
        return undefined;
      }
      if (
        typeof style === 'object' &&
        style !== null &&
        'backgroundColor' in style &&
        typeof style.backgroundColor === 'string'
      ) {
        return style.backgroundColor;
      }
      return undefined;
    }, []);

    const headerBackgroundColor = useMemo(
      () => getBackgroundColor(options.headerStyle),
      [getBackgroundColor, options.headerStyle],
    );

    // Renders
    const renderHeaderRight = useCallback(
      () => (
        <Button variant="ghost" size="icon" icon={Icons.EllipsisVertical} onPress={onMenuPress} />
      ),
      [onMenuPress],
    );

    const renderHeaderBackground = useCallback(
      () => (
        <>
          {!headerReplaceBackground && (
            <>
              <Animated.View
                style={[
                  StyleSheet.absoluteFill,
                  { backgroundColor: headerBackgroundColor || colors.background },
                  backgroundAnimatedStyle,
                ]}
              ></Animated.View>
              <LinearGradient
                colors={[
                  Color.hsl(headerBackgroundColor || colors.background)
                    .alpha(0.8)
                    .string(),
                  Color.hsl(headerBackgroundColor || colors.background)
                    .alpha(0.6)
                    .string(),
                  'transparent',
                ]}
                locations={[0, 0.5, 1]}
                style={StyleSheet.absoluteFill}
              />
            </>
          )}
          {headerBackground?.()}
        </>
      ),
      [
        headerReplaceBackground,
        headerBackgroundColor,
        colors.background,
        backgroundAnimatedStyle,
        headerBackground,
      ],
    );

    const renderHeaderTitle = useCallback(
      (props: HeaderTitleProps) =>
        typeof headerTitle === 'string' ? (
          <ReanimatedHeaderTitle style={titleAnimatedStyle} tintColor={colors.foreground}>
            {headerTitle}
          </ReanimatedHeaderTitle>
        ) : (
          <Animated.View style={titleAnimatedStyle}>{headerTitle?.(props)}</Animated.View>
        ),
      [titleAnimatedStyle, colors.foreground, headerTitle],
    );

    const screenOptions = useMemo(
      () => ({
        ...(onMenuPress
          ? {
              headerRight: renderHeaderRight,
            }
          : {}),
        headerStyle: [options.headerStyle, { backgroundColor: 'transparent' }],
        headerBackground: !isLiquidGlassAvailable ? renderHeaderBackground : undefined,
        title: typeof headerTitle === 'string' ? headerTitle : undefined,
        ...options,
        headerTitle: disabledTitleAnimation ? headerTitle : renderHeaderTitle,
      }),
      [
        onMenuPress,
        headerTitle,
        options,
        renderHeaderBackground,
        renderHeaderTitle,
        renderHeaderRight,
        isLiquidGlassAvailable,
        disabledTitleAnimation,
      ],
    );

    return <Stack.Screen {...props} options={screenOptions} />;
  },
);
AnimatedStackScreen.displayName = 'AnimatedStackScreen';

export default AnimatedStackScreen;
