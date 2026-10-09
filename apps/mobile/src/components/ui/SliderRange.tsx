import { View, TextInput } from 'react-native';
import { forwardRef, useEffect, useImperativeHandle } from 'react';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { scheduleOnRN } from 'react-native-worklets';
import tw from '../../lib/tw';
import { useTheme } from '../../providers/ThemeProvider';
import { BORDER_RADIUS } from '../../theme/globals';
import * as Haptics from 'expo-haptics';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

export interface SliderRangeRef {
  reset: () => void;
}

export interface SliderRangeProps {
  thumbSize?: number;
  containerStyle?: View['props']['style'];
  sliderContainerStyle?: View['props']['style'];
  min: number;
  max: number;
  step: number;
  onValueChange: (value: { min: number; max: number }) => void;
  haptics?: boolean;
  defaultMin?: number;
  defaultMax?: number;
  /**
   * A function to format the label values displayed above the thumbs.
   * @worklet
   *
   * ⚠️ IMPORTANT: This function runs on the UI thread as a worklet.
   * Add 'worklet'; as the first line of the function.
   *
   * @example
   * ```tsx
   * formatLabel={(value) => {
   *   'worklet';
   *   return `${value}€`;
   * }}
   * ```
   */
  formatLabel?: (value: number) => string;
}

const SliderRange = forwardRef<SliderRangeRef, SliderRangeProps>(
  (
    {
      thumbSize = 20,
      containerStyle,
      sliderContainerStyle,
      min,
      max,
      step,
      onValueChange,
      haptics = true,
      defaultMin,
      defaultMax,
      formatLabel,
    },
    ref,
  ) => {
    const { colors } = useTheme();

    // Shared values
    const sliderWidth = useSharedValue(0);
    const position = useSharedValue(0);
    const position2 = useSharedValue(0);
    const opacity = useSharedValue(0);
    const opacity2 = useSharedValue(0);
    const context = useSharedValue(0);
    const context2 = useSharedValue(0);

    // Logical values
    const minValue = useSharedValue(min);
    const maxValue = useSharedValue(max);

    const triggerHaptics = () => {
      if (haptics && process.env.EXPO_OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    };

    const updateValues = () => {
      const stepWidth = sliderWidth.value / ((max - min) / step);
      const newMin = min + Math.round(Math.min(position.value, position2.value) / stepWidth) * step;
      const newMax = min + Math.round(Math.max(position.value, position2.value) / stepWidth) * step;

      if (newMin !== minValue.value || newMax !== maxValue.value) {
        minValue.value = newMin;
        maxValue.value = newMax;
        scheduleOnRN(triggerHaptics);
      }
    };

    const pan = Gesture.Pan()
      .onBegin(() => {
        context.value = position.value;
        opacity.value = 1;
        scheduleOnRN(triggerHaptics);
      })
      .onUpdate((e) => {
        position.value = Math.min(Math.max(context.value + e.translationX, 0), sliderWidth.value);
        scheduleOnRN(updateValues);
      })
      .onEnd(() => {
        opacity.value = 0;
        const stepWidth = sliderWidth.value / ((max - min) / step);
        const snapped1 = Math.round(position.value / stepWidth) * stepWidth;
        const snapped2 = Math.round(position2.value / stepWidth) * stepWidth;

        position.value = withSpring(snapped1);
        position2.value = withSpring(snapped2);

        const newMin = min + Math.round(Math.min(snapped1, snapped2) / stepWidth) * step;
        const newMax = min + Math.round(Math.max(snapped1, snapped2) / stepWidth) * step;
        minValue.value = newMin;
        maxValue.value = newMax;

        scheduleOnRN(onValueChange, { min: newMin, max: newMax });
      });

    const pan2 = Gesture.Pan()
      .onBegin(() => {
        context2.value = position2.value;
        opacity2.value = 1;
        scheduleOnRN(triggerHaptics);
      })
      .onUpdate((e) => {
        position2.value = Math.min(Math.max(context2.value + e.translationX, 0), sliderWidth.value);
        scheduleOnRN(updateValues);
      })
      .onEnd(() => {
        opacity2.value = 0;
        const stepWidth = sliderWidth.value / ((max - min) / step);
        const snapped1 = Math.round(position.value / stepWidth) * stepWidth;
        const snapped2 = Math.round(position2.value / stepWidth) * stepWidth;

        position.value = withSpring(snapped1);
        position2.value = withSpring(snapped2);

        const newMin = min + Math.round(Math.min(snapped1, snapped2) / stepWidth) * step;
        const newMax = min + Math.round(Math.max(snapped1, snapped2) / stepWidth) * step;
        minValue.value = newMin;
        maxValue.value = newMax;

        scheduleOnRN(onValueChange, { min: newMin, max: newMax });
      });

    // Animations
    const animatedStyle1 = useAnimatedStyle(() => ({
      transform: [{ translateX: position.value }],
    }));

    const animatedStyle2 = useAnimatedStyle(() => ({
      transform: [{ translateX: position2.value }],
    }));

    const opacityStyle1 = useAnimatedStyle(() => ({
      opacity: opacity.value,
    }));

    const opacityStyle2 = useAnimatedStyle(() => ({
      opacity: opacity2.value,
    }));

    const sliderStyle = useAnimatedStyle(() => {
      const start = Math.min(position.value, position2.value);
      const end = Math.max(position.value, position2.value);
      return {
        transform: [{ translateX: start }],
        width: end - start,
      };
    });

    const minLabelText = useAnimatedProps(() => {
      const isThumb1Left = position.value <= position2.value;
      const value = isThumb1Left ? minValue.value : maxValue.value;
      const formattedValue = formatLabel ? formatLabel(value) : value.toString();
      return {
        text: formattedValue,
        defaultValue: formattedValue,
      };
    });

    const maxLabelText = useAnimatedProps(() => {
      const isThumb1Left = position.value <= position2.value;
      const value = isThumb1Left ? maxValue.value : minValue.value;
      const formattedValue = formatLabel ? formatLabel(value) : value.toString();
      return {
        text: formattedValue,
        defaultValue: formattedValue,
      };
    });

    const thumbStyle: View['props']['style'] = [
      tw`absolute rounded-full`,
      {
        width: thumbSize,
        height: thumbSize,
        left: -thumbSize / 2,
        borderWidth: thumbSize * 0.1,
        backgroundColor: colors.accentYellowForeground,
        borderColor: colors.accentYellow,
      },
    ];

    const labelStyle: View['props']['style'] = [
      tw`absolute justify-center items-center self-center`,
      {
        top: -40,
        bottom: 20,
        backgroundColor: colors.background,
        borderRadius: BORDER_RADIUS,
      },
    ];

    const labelTextStyle: TextInput['props']['style'] = [
      {
        color: colors.foreground,
        padding: 5,
        fontWeight: 'bold',
        fontSize: 16,
        width: '100%',
        marginHorizontal: 2,
        textAlign: 'center',
      },
    ];

    const updateThumbPositions = (width: number) => {
      if (width <= 0) return;

      const stepWidth = width / ((max - min) / step);

      const clampedMin = defaultMin !== undefined ? Math.min(Math.max(defaultMin, min), max) : min;
      const clampedMax = defaultMax !== undefined ? Math.min(Math.max(defaultMax, min), max) : max;

      const start = ((clampedMin - min) / step) * stepWidth;
      const end = ((clampedMax - min) / step) * stepWidth;

      position.value = withSpring(start);
      position2.value = withSpring(end);

      minValue.value = clampedMin;
      maxValue.value = clampedMax;
    };

    useEffect(() => {
      if (sliderWidth.value > 0) {
        updateThumbPositions(sliderWidth.value);
      }
    }, [min, max, step]);

    useImperativeHandle(ref, () => ({
      reset: () => {
        if (sliderWidth.value > 0) {
          position.value = withSpring(0);
          position2.value = withSpring(sliderWidth.value);
          minValue.value = min;
          maxValue.value = max;
        }
      },
    }));

    return (
      <View
        style={[
          tw`justify-center items-center flex-1`,
          {
            paddingHorizontal: thumbSize / 2,
            height: Math.max(thumbSize, 40),
          },
          containerStyle,
        ]}
      >
        <View
          onLayout={(e) => {
            const { width } = e.nativeEvent.layout;
            sliderWidth.value = width;

            const stepWidth = width / ((max - min) / step);

            const clampedMin =
              defaultMin !== undefined ? Math.min(Math.max(defaultMin, min), max) : min;
            const clampedMax =
              defaultMax !== undefined ? Math.min(Math.max(defaultMax, min), max) : max;

            if (position.value === 0 && position2.value === 0) {
              const start = ((clampedMin - min) / step) * stepWidth;
              const end = ((clampedMax - min) / step) * stepWidth;

              position.value = start;
              position2.value = end;

              minValue.value = clampedMin;
              maxValue.value = clampedMax;
            }
          }}
          style={[
            tw`relative w-full justify-center items-center`,
            { height: 8 },
            sliderContainerStyle,
          ]}
        >
          <View
            style={[tw`absolute inset-0 rounded-full`, { backgroundColor: colors.mutedForeground }]}
          />
          <Animated.View
            style={[
              tw`absolute inset-0 rounded-full`,
              { backgroundColor: colors.accentYellow },
              sliderStyle,
            ]}
          />
          <GestureDetector gesture={pan}>
            <Animated.View style={[thumbStyle, animatedStyle1]}>
              <Animated.View style={[labelStyle, opacityStyle1]}>
                <AnimatedTextInput
                  style={labelTextStyle}
                  animatedProps={minLabelText}
                  editable={false}
                />
              </Animated.View>
            </Animated.View>
          </GestureDetector>
          <GestureDetector gesture={pan2}>
            <Animated.View style={[thumbStyle, animatedStyle2]}>
              <Animated.View style={[labelStyle, opacityStyle2]}>
                <AnimatedTextInput
                  style={labelTextStyle}
                  animatedProps={maxLabelText}
                  editable={false}
                />
              </Animated.View>
            </Animated.View>
          </GestureDetector>
        </View>
      </View>
    );
  },
);
SliderRange.displayName = 'SliderRange';

export default SliderRange;
