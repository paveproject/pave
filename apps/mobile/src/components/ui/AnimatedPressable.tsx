import React, { forwardRef } from 'react';
import { Pressable, PressableProps, View, ViewStyle, StyleProp } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';

export type AnimationType = 'scale' | 'opacity' | 'none';

export interface AnimatedPressableProps extends PressableProps {
  children: React.ReactNode;
  animation?: AnimationType;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

const ComponentPressable = Animated.createAnimatedComponent(Pressable);

export const AnimatedPressable = forwardRef<View, AnimatedPressableProps>(
  (
    {
      children,
      onPress,
      animation = 'scale',
      haptic = true,
      disabled = false,
      style,
      containerStyle,
      ...props
    },
    ref,
  ) => {
    const scale = useSharedValue(1);
    const opacity = useSharedValue(1);

    const triggerHapticFeedback = () => {
      if (haptic && !disabled && process.env.EXPO_OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    };

    const handlePressIn: PressableProps['onPressIn'] = (ev) => {
      'worklet';
      if (disabled) return;

      if (animation === 'scale') {
        scale.value = withSpring(0.96, {
          damping: 15,
          stiffness: 400,
          mass: 0.5,
        });
        opacity.value = withSpring(0.9, { damping: 20, stiffness: 300 });
      } else if (animation === 'opacity') {
        opacity.value = withSpring(0.6, { damping: 20, stiffness: 300 });
      }

      props.onPressIn?.(ev);
    };

    const handlePressOut: PressableProps['onPressOut'] = (ev) => {
      'worklet';
      scale.value = withSpring(1, {
        damping: 20,
        stiffness: 400,
        mass: 0.8,
      });
      opacity.value = withSpring(1, { damping: 20, stiffness: 300 });

      props.onPressOut?.(ev);
    };

    const handlePress: PressableProps['onPress'] = (e) => {
      if (disabled) return;
      triggerHapticFeedback();
      onPress?.(e);
    };

    const animatedStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scale: scale.value }],
        opacity: opacity.value * (disabled ? 0.5 : 1),
      };
    });

    return (
      <ComponentPressable
        ref={ref}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled}
        style={[animatedStyle, style]}
        {...props}
      >
        {children}
      </ComponentPressable>
    );
  },
);

AnimatedPressable.displayName = 'AnimatedPressable';
