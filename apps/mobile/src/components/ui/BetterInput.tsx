import * as React from 'react';
import { Pressable, StyleProp, TextInput, TextStyle, View, ViewStyle } from 'react-native';
import { useTheme } from '../../providers/ThemeProvider';
import tw from '../../lib/tw';
import { Icons } from '../../constants/Icons';

export interface InputProps extends React.ComponentProps<typeof TextInput> {
  variant?: 'default' | 'outline';
  clearable?: boolean;
  leftIcon?: 'search';
  leftIconStyle?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

const BetterInput = React.forwardRef<React.ComponentRef<typeof TextInput>, InputProps>(
  (
    {
      variant,
      style,
      clearable,
      containerStyle,
      leftIcon,
      leftIconStyle,
      onFocus,
      onBlur,
      ...props
    },
    ref,
  ) => {
    const { colors } = useTheme();
    const [isFocused, setIsFocused] = React.useState(false);
    const getIcons = React.useCallback(
      (name: string) => {
        switch (name) {
          case 'search':
            return <Icons.Search color={colors.mutedForeground} size={15} style={leftIconStyle} />;
          default:
            return null;
        }
      },
      [colors.mutedForeground, leftIconStyle],
    );
    const icon = React.useMemo(() => {
      return leftIcon ? getIcons(leftIcon) : leftIcon;
    }, [leftIcon, getIcons]);
    const variantStyles = React.useMemo(() => {
      const containerStyle: { shared: string; variant: StyleProp<ViewStyle> } = {
        shared: 'flex-row items-center gap-2 rounded-md overflow-hidden px-2',
        variant: {
          backgroundColor: variant === 'outline' ? colors.background : colors.muted,
        },
      };
      const inputStyle: { shared: string; variant: StyleProp<TextStyle> } = {
        shared: 'flex-1 h-10 native:h-12',
        variant: {
          color: colors.foreground,
        },
      };
      return {
        containerStyle,
        inputStyle,
      };
    }, [colors, variant]);
    return (
      <View
        style={[
          tw`${variantStyles.containerStyle.shared}`,
          variantStyles.containerStyle.variant,
          containerStyle,
        ]}
      >
        {icon && icon}
        <TextInput
          ref={ref}
          style={[tw`${variantStyles.inputStyle.shared}`, variantStyles.inputStyle.variant, style]}
          onFocus={(e) => {
            setIsFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            onBlur?.(e);
          }}
          {...props}
        />
        {isFocused &&
          clearable &&
          !props.multiline &&
          ((props.value && props.value?.length > 0) ||
            (props.defaultValue && props.defaultValue?.length > 0)) && (
            <Pressable
              onPress={() => {
                props.onChangeText?.('');
              }}
            >
              <Icons.Cancel color={colors.foreground} size={20} />
            </Pressable>
          )}
      </View>
    );
  },
);
BetterInput.displayName = 'BetterInput';

export { BetterInput };
