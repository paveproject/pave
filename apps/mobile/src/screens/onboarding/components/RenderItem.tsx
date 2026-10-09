import { StyleSheet, View, useWindowDimensions } from 'react-native';
import React from 'react';
import Animated, {
  Extrapolation,
  SharedValue,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { OnboardingData } from '../data';
import tw from '../../../lib/tw';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BORDER_RADIUS_LG, GAP_LG, PADDING_HORIZONTAL } from '../../../theme/globals';
import { Image } from 'expo-image';

type Props = {
  index: number;
  x: SharedValue<number>;
  item: OnboardingData;
};

const RenderItem = ({ index, x, item }: Props) => {
  const insets = useSafeAreaInsets();
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  const circleAnimation = useAnimatedStyle(() => {
    const scale = interpolate(
      x.value,
      [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
      [1, 4, 4],
      Extrapolation.CLAMP,
    );

    return {
      transform: [{ scale: scale }],
    };
  });

  const textAnimationStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      x.value,
      [(index - 1) * SCREEN_WIDTH, index * SCREEN_WIDTH, (index + 1) * SCREEN_WIDTH],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    return {
      opacity: progress,
    };
  });
  return (
    <View style={[styles.itemContainer, { width: SCREEN_WIDTH, paddingTop: insets.top }]}>
      <View style={tw`absolute inset-0 items-center justify-end`}>
        <Animated.View
          style={[
            {
              width: SCREEN_WIDTH,
              height: SCREEN_WIDTH,
              borderRadius: SCREEN_WIDTH / 2,
              backgroundColor: item.backgroundColor,
            },
            circleAnimation,
          ]}
        />
      </View>
      <Animated.View style={[tw`items-center justify-center w-full`, { gap: GAP_LG }]}>
        <Image
          transition={500}
          source={item.image}
          style={[
            tw`w-full h-full max-w-lg`,
            {
              maxHeight: 700,
              borderRadius: BORDER_RADIUS_LG,
            },
          ]}
          contentFit={'contain'}
        />
        <Animated.Text
          style={[
            tw`text-center text-xl font-bold`,
            { color: item.textColor, marginHorizontal: PADDING_HORIZONTAL },
            textAnimationStyle,
          ]}
        >
          {item.text}
        </Animated.Text>
      </Animated.View>
    </View>
  );
};

export default RenderItem;

const styles = StyleSheet.create({
  itemContainer: {
    flex: 1,
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 120,
  },
});
