import { Icon } from './icon';
import { ButtonSpinner, SpinnerVariant } from './spinner';
import { Text } from './text';
import tw from '../../lib/tw';
import { useTheme } from '../../providers/ThemeProvider';
import { HEIGHT } from '../../theme/globals';
import * as Haptics from 'expo-haptics';
import { LucideProps } from 'lucide-react-native';
import { forwardRef } from 'react';
import { Pressable, PressableProps, TextStyle, View, ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

export type ButtonVariant =
  | 'default'
  | 'destructive'
  | 'success'
  | 'outline'
  | 'muted'
  | 'ghost'
  | 'link'
  | 'accent-yellow'
  | 'accent-blue';

export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'fit';

export type ButtonIconPosition = 'left' | 'right';

export interface ButtonProps extends PressableProps {
  label?: string;
  children?: React.ReactNode;
  animation?: boolean;
  haptic?: boolean;
  icon?: React.ComponentType<LucideProps>;
  iconProps?: LucideProps;
  iconPosition?: ButtonIconPosition;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  loadingVariant?: SpinnerVariant;
  style?: ViewStyle | ViewStyle[];
  textStyle?: TextStyle | TextStyle[];
  containerStyle?: ViewStyle | ViewStyle[];
}

export const Button = forwardRef<View, ButtonProps>(
  (
    {
      children,
      icon,
      iconProps,
      iconPosition = 'left',
      onPress,
      variant = 'default',
      size = 'default',
      disabled = false,
      loading = false,
      animation = true,
      haptic = true,
      loadingVariant = 'default',
      style,
      containerStyle,
      textStyle,
      ...props
    },
    ref,
  ) => {
    const { colors } = useTheme();
    const primaryColor = colors.primary;
    const primaryForegroundColor = colors.primaryForeground;
    const mutedColor = colors.muted;
    const destructiveColor = colors.destructive;
    const destructiveForegroundColor = colors.destructiveForeground;
    const successColor = colors.success;
    const successColorForegroundColor = colors.successForeground;
    const borderColor = colors.border;

    // Animation values for liquid glass effect
    const scale = useSharedValue(1);
    const brightness = useSharedValue(1);

    const getButtonStyle = (): ViewStyle => {
      const baseStyle: ViewStyle = {
        ...tw`rounded-lg`,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
      };

      // Size variants
      switch (size) {
        case 'sm':
          Object.assign(baseStyle, { height: 44, paddingHorizontal: 24 });
          break;
        case 'lg':
          Object.assign(baseStyle, { height: 54, paddingHorizontal: 36 });
          break;
        case 'icon':
          Object.assign(baseStyle, {
            height: HEIGHT,
            width: HEIGHT,
            paddingHorizontal: 0,
          });
          break;
        case 'fit':
          Object.assign(baseStyle, { height: 'auto', paddingHorizontal: 0 });
          break;
        default:
          Object.assign(baseStyle, { height: HEIGHT, ...tw`px-4` });
      }

      // Variant styles
      switch (variant) {
        case 'destructive':
          return { ...baseStyle, backgroundColor: destructiveColor };
        case 'success':
          return { ...baseStyle, backgroundColor: successColor };
        case 'outline':
          return {
            ...baseStyle,
            backgroundColor: mutedColor,
            borderWidth: 1,
            borderColor,
          };
        case 'muted':
          return { ...baseStyle, backgroundColor: mutedColor };
        case 'ghost':
          return { ...baseStyle, backgroundColor: 'transparent' };
        case 'link':
          return {
            ...baseStyle,
            backgroundColor: 'transparent',
            height: 'auto',
            paddingHorizontal: 0,
          };
        case 'accent-yellow':
          return {
            ...baseStyle,
            backgroundColor: colors.accentYellow,
          };
        case 'accent-blue':
          return {
            ...baseStyle,
            backgroundColor: colors.accentBlue,
          };
        default:
          return { ...baseStyle, backgroundColor: primaryColor };
      }
    };

    const getButtonTextStyle = (): TextStyle => {
      const baseTextStyle: TextStyle = tw``;

      switch (variant) {
        case 'destructive':
          return { ...baseTextStyle, color: destructiveForegroundColor };
        case 'success':
          return { ...baseTextStyle, color: successColorForegroundColor };
        case 'outline':
          return { ...baseTextStyle, color: colors.foreground };
        case 'muted':
          return { ...baseTextStyle, color: colors.foreground };
        case 'ghost':
          return { ...baseTextStyle, color: colors.foreground };
        case 'link':
          return {
            ...baseTextStyle,
            color: colors.foreground,
            textDecorationLine: 'underline',
          };
        case 'accent-yellow':
          return {
            ...baseTextStyle,
            color: colors.accentYellowForeground,
          };
        case 'accent-blue':
          return {
            ...baseTextStyle,
            color: colors.accentBlueForeground,
          };
        default:
          return { ...baseTextStyle, color: primaryForegroundColor };
      }
    };

    const getColor = (): string => {
      switch (variant) {
        case 'destructive':
          return destructiveForegroundColor;
        case 'success':
          return destructiveForegroundColor;
        case 'outline':
          return colors.foreground;
        case 'muted':
          return colors.foreground;
        case 'ghost':
          return colors.foreground;
        case 'link':
          return colors.foreground;
        case 'accent-yellow':
          return colors.accentYellowForeground;
        case 'accent-blue':
          return colors.accentBlueForeground;
        default:
          return primaryForegroundColor;
      }
    };

    // Helper function to get icon size based on button size
    const getIconSize = (): number => {
      switch (size) {
        case 'sm':
          return 16;
        case 'lg':
          return 24;
        case 'icon':
          return 20;
        default:
          return 18;
      }
    };

    // Trigger haptic feedback
    const triggerHapticFeedback = () => {
      if (haptic && !disabled && !loading) {
        if (process.env.EXPO_OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    };

    // Improved animation handlers for liquid glass effect
    const handlePressIn: PressableProps['onPressIn'] = (ev) => {
      'worklet';
      // Trigger haptic feedback
      // triggerHapticFeedback();

      // Scale up with bouncy spring animation
      scale.value = withSpring(0.95, {
        damping: 15,
        stiffness: 400,
        mass: 0.5,
      });

      // Slight brightness increase for glass effect
      brightness.value = withSpring(1.1, {
        damping: 20,
        stiffness: 300,
      });

      // Call original onPressIn if provided
      props.onPressIn?.(ev);
    };

    const handlePressOut: PressableProps['onPressOut'] = (ev) => {
      'worklet';
      // Return to original size with smooth spring
      scale.value = withSpring(1, {
        damping: 20,
        stiffness: 400,
        mass: 0.8,
        overshootClamping: false,
      });

      // Return brightness to normal
      brightness.value = withSpring(1, {
        damping: 20,
        stiffness: 300,
      });

      // Call original onPressOut if provided
      props.onPressOut?.(ev);
    };

    // Handle actual press action
    const handlePress: PressableProps['onPress'] = (e) => {
      triggerHapticFeedback();
      if (onPress && !disabled && !loading) {
        onPress(e);
      }
    };

    // Handle press for TouchableOpacity (non-animated version)
    const handleTouchablePress: PressableProps['onPress'] = (e) => {
      handlePress(e);
    };

    // Animated styles using useAnimatedStyle
    const animatedStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scale: scale.value }],
        opacity: brightness.value * (disabled ? 0.5 : 1),
      };
    });

    // Extract flex value from style prop
    const getFlexFromStyle = () => {
      if (!style) return null;

      const styleArray = Array.isArray(style) ? style : [style];

      // Find the last occurrence of flex (in case of multiple styles with flex)
      for (let i = styleArray.length - 1; i >= 0; i--) {
        const s = styleArray[i];
        if (s && typeof s === 'object' && 'flex' in s) {
          return s.flex;
        }
      }
      return null;
    };

    // Alternative simpler solution - replace flex with alignSelf
    const getPressableStyle = (): ViewStyle => {
      const flexValue = getFlexFromStyle();
      // If flex: 1 is applied, use alignSelf: 'stretch' instead to only affect width
      return flexValue === 1
        ? {
            flex: 1,
            alignSelf: 'stretch',
          }
        : flexValue !== null
          ? {
              flex: flexValue,
              maxHeight: size === 'sm' ? 44 : size === 'lg' ? 54 : HEIGHT,
            }
          : {};
    };

    // Updated getStyleWithoutFlex function
    const getStyleWithoutFlex = () => {
      if (!style) return style;

      const styleArray = Array.isArray(style) ? style : [style];
      return styleArray.map((s) => {
        if (s && typeof s === 'object' && 'flex' in s) {
          const { flex, ...restStyle } = s;
          return restStyle;
        }
        return s;
      });
    };

    const buttonStyle = getButtonStyle();
    const finalTextStyle = getButtonTextStyle();
    const contentColor = getColor();
    const iconSize = getIconSize();
    const styleWithoutFlex = getStyleWithoutFlex();

    return animation ? (
      <Pressable
        ref={ref}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={[getPressableStyle(), containerStyle]}
        {...props}
      >
        <Animated.View style={[animatedStyle, buttonStyle, styleWithoutFlex]}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: loading ? 0.5 : 1,
            }}
          >
            {icon && iconPosition === 'left' && (
              <Icon name={icon} color={contentColor} size={iconSize} {...iconProps} />
            )}
            {typeof children === 'string' ? (
              <Text style={[finalTextStyle, textStyle]}>{children}</Text>
            ) : (
              children
            )}
            {icon && iconPosition === 'right' && (
              <Icon name={icon} color={contentColor} size={iconSize} {...iconProps} />
            )}
          </View>
          {loading && (
            <View style={[tw`absolute inset-0 items-center justify-center`]}>
              <ButtonSpinner size={size} variant={loadingVariant} color={contentColor} />
            </View>
          )}
        </Animated.View>
      </Pressable>
    ) : (
      <Pressable
        ref={ref}
        style={[buttonStyle, disabled && { opacity: 0.5 }, styleWithoutFlex]}
        onPress={handleTouchablePress}
        disabled={disabled || loading}
        {...props}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: loading ? 0.5 : 1 }}
        >
          {icon && iconPosition === 'left' && (
            <Icon name={icon} color={contentColor} size={iconSize} {...iconProps} />
          )}
          {typeof children === 'string' ? (
            <Text style={[finalTextStyle, textStyle]}>{children}</Text>
          ) : (
            children
          )}
          {icon && iconPosition === 'right' && (
            <Icon name={icon} color={contentColor} size={iconSize} {...iconProps} />
          )}
        </View>
        {loading && (
          <View style={[tw`absolute inset-0 items-center justify-center`]}>
            <ButtonSpinner size={size} variant={loadingVariant} color={contentColor} />
          </View>
        )}
      </Pressable>
    );
  },
);

// Add display name for better debugging
Button.displayName = 'Button';
