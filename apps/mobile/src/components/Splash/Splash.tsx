import React, { useCallback, useEffect } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icons } from '../../constants/Icons';
import { useTheme } from '../../providers/ThemeProvider';
import { scheduleOnRN } from 'react-native-worklets';
import { LucideProps } from 'lucide-react-native';
import { clamp } from 'lodash';
import Svg from 'react-native-svg';
import tw from '../../lib/tw';
import { useSplashScreen } from '../../providers/SplashScreenProvider';

export const Logo = React.forwardRef<Svg, LucideProps>((props: LucideProps, ref) => {
  const { colors } = useTheme();
  const width = 1000;
  return <Icons.app.icon ref={ref} color={props.fill || colors.accentYellow} width={width} />;
});
Logo.displayName = 'Logo';

export function Splash({ children }: React.PropsWithChildren) {
  'use no memo';
  const { isReady: isReadyContext, state } = useSplashScreen();
  const { colors } = useTheme();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const intro = useSharedValue(0);
  const outroLogo = useSharedValue(0);
  const outroApp = useSharedValue(0);
  const outroAppOpacity = useSharedValue(0);
  const [isAnimationComplete, setIsAnimationComplete] = React.useState(false);
  const [isLayoutReady, setIsLayoutReady] = React.useState(false);
  const [reduceMotion, setReduceMotion] = React.useState<boolean | undefined>(false);
  const isReady = isReadyContext && isLayoutReady && reduceMotion !== undefined;

  const logoAnimation = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: interpolate(intro.get(), [0, 1], [0.8, 1], 'clamp'),
        },
        {
          scale: interpolate(outroLogo.get(), [0, 0.08, 1], [1, 0.8, 500], 'clamp'),
        },
      ],
      opacity: interpolate(intro.get(), [0, 1], [0, 1], 'clamp'),
    };
  });
  const bottomLogoAnimation = useAnimatedStyle(() => {
    return {
      opacity: interpolate(intro.get(), [0, 1], [0, 1], 'clamp'),
    };
  });
  const reducedLogoAnimation = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: interpolate(intro.get(), [0, 1], [0.8, 1], 'clamp'),
        },
      ],
      opacity: interpolate(intro.get(), [0, 1], [0, 1], 'clamp'),
    };
  });

  const logoWrapperAnimation = useAnimatedStyle(() => {
    return {
      opacity: interpolate(outroAppOpacity.get(), [0, 0.1, 0.2, 1], [1, 1, 0, 0], 'clamp'),
    };
  });

  const appAnimation = useAnimatedStyle(() => {
    return {
      opacity: interpolate(outroAppOpacity.get(), [0, 0.1, 0.2, 1], [0, 0, 1, 1], 'clamp'),
    };
  });

  const onFinish = useCallback(() => setIsAnimationComplete(true), []);
  const onLayout = useCallback(() => setIsLayoutReady(true), []);

  useEffect(() => {
    if (state === 'finished') {
      intro.set(() =>
        withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }, async () => {
          // set these values to check animation at specific point
          outroLogo.set(() =>
            withTiming(1, { duration: 1200, easing: Easing.in(Easing.cubic) }, () => {
              scheduleOnRN(onFinish);
            }),
          );
          outroApp.set(() =>
            withTiming(1, {
              duration: 1200,
              easing: Easing.inOut(Easing.cubic),
            }),
          );
          outroAppOpacity.set(() =>
            withTiming(1, {
              duration: 1200,
              easing: Easing.in(Easing.cubic),
            }),
          );
        }),
      );
    }
  }, [onFinish, intro, outroLogo, outroApp, outroAppOpacity, state]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
  }, []);

  const logoAnimations = reduceMotion === true ? reducedLogoAnimation : logoAnimation;
  // special off-spec color for dark mode

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {!isAnimationComplete && (
        <View style={[{ backgroundColor: colors.background }, StyleSheet.absoluteFill]}>
          <Animated.View
            style={[
              bottomLogoAnimation,
              {
                position: 'absolute',
                bottom: insets.bottom + 40,
                left: 0,
                right: 0,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0,
              },
            ]}
          >
            <Icons.app.logo color={colors.accentYellow} width={clamp(screenWidth * 0.3, 90, 120)} />
          </Animated.View>
        </View>
      )}

      {isReady && (
        <>
          <Animated.View style={[tw`flex-1`, appAnimation]}>{children}</Animated.View>

          {!isAnimationComplete && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                logoWrapperAnimation,
                {
                  flex: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                  transform: [
                    // {translateY: -(insets.top / 2)},
                    { scale: 0.1 },
                  ], // scale from 1000px to 100px
                },
              ]}
            >
              <Animated.View style={[logoAnimations]}>
                <Logo fill={colors.accentYellow} />
              </Animated.View>
            </Animated.View>
          )}
        </>
      )}
    </View>
  );
}
