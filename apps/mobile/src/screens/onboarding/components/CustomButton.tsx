import { FlatList, StyleSheet, TouchableWithoutFeedback, useWindowDimensions } from 'react-native';
import React from 'react';
import Animated, {
  AnimatedRef,
  SharedValue,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { OnboardingData } from '../data';
import { useNavigation, useRouter } from 'expo-router';
import { useUIStore } from '../../../stores/useUIStore';
import { useAuth } from '../../../providers/AuthProvider';
import { useTranslations } from 'use-intl';
import { upperFirst } from 'lodash';
import tw from '../../../lib/tw';
import Ionicons from '@expo/vector-icons/Ionicons';

const AnimatedChevron = Animated.createAnimatedComponent(Ionicons);

type Props = {
  data: OnboardingData[];
  flatListIndex: SharedValue<number>;
  flatListRef: AnimatedRef<FlatList<OnboardingData>>;
  x: SharedValue<number>;
};

const CustomButton = ({ data, flatListRef, flatListIndex, x }: Props) => {
  const { user } = useAuth();
  const t = useTranslations();
  const setHasOnboarded = useUIStore((state) => state.setHasOnboarded);
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const router = useRouter();
  const navigation = useNavigation();
  const routes = navigation.getState()?.routes;
  const prevRoute = routes ? routes[routes.length - 2] : null;

  const inputRange = data.map((_, i) => i * SCREEN_WIDTH);
  const bgColors = data.map((d) => d.backgroundColor);
  const textColors = data.map((d) => d.textColor);

  const buttonAnimationStyle = useAnimatedStyle(() => {
    return {
      width: flatListIndex.value === data.length - 1 ? withSpring(140) : withSpring(60),
      height: 60,
    };
  });

  const arrowAnimationStyle = useAnimatedStyle(() => {
    return {
      width: 30,
      height: 30,
      opacity: flatListIndex.value === data.length - 1 ? withTiming(0) : withTiming(1),
      transform: [
        {
          translateX: flatListIndex.value === data.length - 1 ? withTiming(100) : withTiming(0),
        },
      ],
    };
  });

  const textAnimationStyle = useAnimatedStyle(() => {
    const color = interpolateColor(x.value, inputRange, bgColors);

    return {
      opacity: flatListIndex.value === data.length - 1 ? withTiming(1) : withTiming(0),
      transform: [
        {
          translateX: flatListIndex.value === data.length - 1 ? withTiming(0) : withTiming(-100),
        },
      ],
      color,
    };
  });
  const animatedColor = useAnimatedStyle(() => {
    const backgroundColor = interpolateColor(x.value, inputRange, textColors);

    return { backgroundColor };
  });
  const arrowIconAnimationProps = useAnimatedProps(() => {
    const color = interpolateColor(x.value, inputRange, bgColors);
    return { color };
  });

  return (
    <TouchableWithoutFeedback
      onPress={() => {
        if (flatListIndex.value < data.length - 1) {
          flatListRef.current?.scrollToIndex({ index: flatListIndex.value + 1 });
        } else {
          setHasOnboarded(true);
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace({ pathname: '/(tabs)/(home)' });
          }

          if (!user && (!prevRoute || !prevRoute.name.includes('auth'))) {
            router.push({ pathname: '/auth' });
          }
        }
      }}
    >
      <Animated.View style={[styles.container, buttonAnimationStyle, animatedColor]}>
        <Animated.Text style={[tw`absolute font-semibold`, textAnimationStyle]}>
          {upperFirst(t('common.messages.get_started'))}
        </Animated.Text>
        <Animated.View style={[tw`absolute`, arrowAnimationStyle]}>
          <AnimatedChevron
            name="chevron-forward"
            size={30}
            animatedProps={arrowIconAnimationProps}
          />
        </Animated.View>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

export default CustomButton;

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#1e2169',
    padding: 10,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
});
