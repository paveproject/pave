import { StyleSheet, useWindowDimensions } from 'react-native';
import React from 'react';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
} from 'react-native-reanimated';

type Props = {
  index: number;
  x: SharedValue<number>;
  colors: string[];
};

const Dot = ({ index, x, colors }: Props) => {
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  const animatedDotStyle = useAnimatedStyle(() => {
    const widthAnimation = interpolate(
      x.value,
      [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
      [10, 20, 10],
      Extrapolation.CLAMP,
    );

    const opacityAnimation = interpolate(
      x.value,
      [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
      [0.5, 1, 0.5],
      Extrapolation.CLAMP,
    );
    return {
      width: widthAnimation,
      opacity: opacityAnimation,
    };
  });

  const animatedColor = useAnimatedStyle(() => {
    // interpolateColor needs at least two points - with a single onboarding
    // screen, `colors` has only one, so interpolate it against itself.
    const colorInputRange =
      colors.length > 1 ? colors.map((_, i) => i * SCREEN_WIDTH) : [0, SCREEN_WIDTH];
    const colorOutputRange = colors.length > 1 ? colors : [colors[0], colors[0]];

    const backgroundColor = interpolateColor(x.value, colorInputRange, colorOutputRange);

    return {
      backgroundColor: backgroundColor,
    };
  });

  return <Animated.View style={[styles.dots, animatedDotStyle, animatedColor]} />;
};

export default Dot;

const styles = StyleSheet.create({
  dots: {
    height: 10,
    marginHorizontal: 10,
    borderRadius: 5,
  },
});
