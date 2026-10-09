import { Icon } from './icon';
import { Icons } from '../../constants/Icons';
import tw from '../../lib/tw';
import { useTheme } from '../../providers/ThemeProvider';
import { BORDER_RADIUS, FONT_SIZE, HEIGHT } from '../../theme/globals';
import { upperFirst } from 'lodash';
import { LucideProps } from 'lucide-react-native';
import React, { forwardRef, ReactElement, useState } from 'react';
import {
  Pressable,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
  FocusEvent,
  BlurEvent,
  StyleProp,
} from 'react-native';
import { useTranslations } from 'use-intl';
import { Text } from './text';

export interface InputProps extends TextInputProps {
  label?: string | null;
  error?: string;
  icon?: React.ComponentType<LucideProps>;
  rightComponent?: React.ReactNode | (() => React.ReactNode);
  containerStyle?: ViewStyle;
  inputStyle?: StyleProp<TextStyle>;
  labelStyle?: StyleProp<TextStyle>;
  errorStyle?: StyleProp<TextStyle>;
  leftSectionStyle?: ViewStyle;
  inputContainerStyle?: ViewStyle | ViewStyle[];
  variant?: 'filled' | 'outline';
  disabled?: boolean;
  type?: 'input' | 'textarea' | 'password';
  placeholder?: string;
  rows?: number; // Only used when type="textarea"
}

export const Input = forwardRef<TextInput, InputProps>(
  (
    {
      label: labelProp,
      error,
      icon: iconProp,
      rightComponent: rightComponentProp,
      containerStyle,
      secureTextEntry: secureTextEntryProp,
      inputStyle,
      labelStyle,
      errorStyle,
      leftSectionStyle,
      inputContainerStyle,
      variant = 'filled',
      disabled = false,
      type = 'input',
      rows = 4,
      onFocus,
      onBlur,
      placeholder,
      ...props
    },
    ref,
  ) => {
    const [showPassword, setShowPassword] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const t = useTranslations();

    // Theme colors
    const { colors } = useTheme();
    const cardColor = colors.card;
    const textColor = colors.foreground;
    const muted = colors.mutedForeground;
    const borderColor = colors.border;
    const primary = colors.accentYellow;
    const danger = colors.destructive;

    // Default value
    const label =
      type === 'password'
        ? labelProp === null
          ? undefined
          : (labelProp ?? upperFirst(t('common.form.password.label')))
        : labelProp;
    const icon = type === 'password' ? (iconProp ?? Icons.Password) : iconProp;
    const secureTextEntry = type === 'password' ? !showPassword : secureTextEntryProp;
    const rightComponent =
      type === 'password' ? (
        <Pressable onPress={() => setShowPassword((prev) => !prev)}>
          {showPassword ? (
            <Icons.EyeOff size={20} color={colors.mutedForeground} />
          ) : (
            <Icons.Eye size={20} color={colors.mutedForeground} />
          )}
        </Pressable>
      ) : (
        rightComponentProp
      );

    // Calculate height based on type
    const getHeight = () => {
      if (type === 'textarea') {
        return rows * 20 + 32; // Approximate line height + padding
      }
      return HEIGHT;
    };

    // Variant styles
    const getVariantStyle = (): ViewStyle => {
      const baseStyle: ViewStyle = {
        borderRadius: BORDER_RADIUS,
        flexDirection: type === 'textarea' ? 'column' : 'row',
        alignItems: type === 'textarea' ? 'stretch' : 'center',
        minHeight: getHeight(),
        paddingHorizontal: 16,
        paddingVertical: type === 'textarea' ? 12 : 0,
      };

      switch (variant) {
        case 'outline':
          return {
            ...baseStyle,
            borderWidth: 1,
            borderColor: error ? danger : isFocused ? primary : borderColor,
            backgroundColor: 'transparent',
          };
        case 'filled':
        default:
          return {
            ...baseStyle,
            borderWidth: 1,
            borderColor: error ? danger : cardColor,
            backgroundColor: cardColor,
          };
      }
    };

    const getInputStyle = (): TextStyle => ({
      flex: 1,
      fontSize: FONT_SIZE,
      lineHeight: type === 'textarea' ? 20 : undefined,
      color: disabled ? muted : error ? danger : textColor,
      paddingVertical: 0, // Remove default padding
      textAlignVertical: type === 'textarea' ? 'top' : 'center',
    });

    const handleFocus = (e: FocusEvent) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: BlurEvent) => {
      if (showPassword) setShowPassword(false);
      setIsFocused(false);
      onBlur?.(e);
    };

    // Render right component - supports both direct components and functions
    const renderRightComponent = () => {
      if (!rightComponent) return null;

      // If it's a function, call it. Otherwise, render directly
      return typeof rightComponent === 'function' ? rightComponent() : rightComponent;
    };

    const renderInputContent = () => (
      <View style={containerStyle}>
        {/* Input Container */}
        <Pressable
          style={[getVariantStyle(), disabled && { opacity: 0.6 }, inputContainerStyle]}
          onPress={() => {
            if (!disabled && ref && 'current' in ref && ref.current) {
              ref.current.focus();
            }
          }}
          disabled={disabled}
        >
          {type === 'textarea' ? (
            // Textarea Layout (Column)
            <>
              {/* Header section with icon, label, and right component */}
              {(icon || label || rightComponent) && (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    marginBottom: 8,
                    gap: 8,
                  }}
                >
                  {/* Left section - Icon + Label */}
                  <View
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}
                    pointerEvents="none"
                  >
                    {icon && <Icon name={icon} size={16} color={error ? danger : muted} />}
                    {label && (
                      <Text
                        numberOfLines={1}
                        ellipsizeMode="tail"
                        style={[
                          {
                            color: error ? danger : muted,
                          },
                          labelStyle,
                        ]}
                        pointerEvents="none"
                      >
                        {label}
                      </Text>
                    )}
                  </View>

                  {/* Right Component */}
                  {renderRightComponent()}
                </View>
              )}

              {/* TextInput section */}
              <TextInput
                ref={ref}
                multiline
                numberOfLines={rows}
                style={[getInputStyle(), inputStyle]}
                placeholderTextColor={error ? danger + '99' : muted}
                placeholder={placeholder || 'Type your message...'}
                onFocus={handleFocus}
                onBlur={handleBlur}
                editable={!disabled}
                selectionColor={primary}
                secureTextEntry={secureTextEntry}
                {...props}
              />
            </>
          ) : (
            // Input Layout (Row)
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {/* Left section - Icon + Label (fixed width to simulate grid column) */}
              {icon || label ? (
                <View
                  style={[
                    {
                      width: label ? 120 : 'auto',
                    },
                    tw`flex-row items-center gap-2`,
                    leftSectionStyle,
                  ]}
                  pointerEvents="none"
                >
                  {icon && <Icon name={icon} size={16} color={error ? danger : muted} />}
                  {label && (
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        {
                          color: error ? danger : muted,
                        },
                        labelStyle,
                      ]}
                      pointerEvents="none"
                    >
                      {label}
                    </Text>
                  )}
                </View>
              ) : null}

              {/* TextInput section - takes remaining space */}
              <View style={{ flex: 1 }}>
                <TextInput
                  ref={ref}
                  style={[getInputStyle(), inputStyle]}
                  placeholderTextColor={error ? danger + 99 : muted}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  editable={!disabled}
                  placeholder={placeholder}
                  selectionColor={primary}
                  secureTextEntry={secureTextEntry}
                  {...props}
                />
              </View>

              {/* Right Component */}
              {renderRightComponent()}
            </View>
          )}
        </Pressable>

        {/* Error Message */}
        {error && (
          <Text
            style={[
              {
                marginLeft: 14,
                marginTop: 4,
                fontSize: 14,
                color: danger,
              },
              errorStyle,
            ]}
          >
            {error}
          </Text>
        )}
      </View>
    );

    return renderInputContent();
  },
);
Input.displayName = 'Input';

export interface GroupedInputProps {
  children: React.ReactNode;
  containerStyle?: ViewStyle;
  title?: string;
  titleStyle?: TextStyle;
  showErrors?: boolean;
}

export const GroupedInput = ({
  children,
  containerStyle,
  title,
  titleStyle,
  showErrors = false,
}: GroupedInputProps) => {
  const { colors } = useTheme();
  const border = colors.border;
  const background = colors.card;
  const danger = colors.destructive;

  const childrenArray = React.Children.toArray(children);

  const errors = childrenArray
    .filter(
      (child): child is ReactElement<any> =>
        React.isValidElement(child) && !!(child.props as any).error,
    )
    .map((child) => child.props.error);

  const renderGroupedContent = () => (
    <View style={containerStyle}>
      {!!title && <Text style={[tw`ml-2 mb-2 font-semibold`, titleStyle]}>{title}</Text>}

      <View
        style={{
          backgroundColor: background,
          borderColor: border,
          borderWidth: 1,
          borderRadius: BORDER_RADIUS,
          overflow: 'hidden',
        }}
      >
        {childrenArray.map((child, index) => (
          <View
            key={index}
            style={{
              minHeight: HEIGHT,
              paddingVertical: 12,
              paddingHorizontal: 16,
              justifyContent: 'center',
              borderBottomWidth: index !== childrenArray.length - 1 ? 1 : 0,
              borderColor: border,
            }}
          >
            {child}
          </View>
        ))}
      </View>

      {showErrors && errors.length > 0 && (
        <View style={{ marginTop: 6 }}>
          {errors.map((error, i) => (
            <Text
              key={i}
              style={{
                fontSize: 14,
                color: danger,
                marginTop: i === 0 ? 0 : 1,
                marginLeft: 8,
              }}
            >
              {error}
            </Text>
          ))}
        </View>
      )}
    </View>
  );

  return renderGroupedContent();
};

export interface GroupedInputItemProps extends Omit<TextInputProps, 'style'> {
  label?: string | null;
  error?: string;
  icon?: React.ComponentType<LucideProps>;
  rightComponent?: React.ReactNode | (() => React.ReactNode);
  inputStyle?: TextStyle;
  labelStyle?: TextStyle;
  errorStyle?: TextStyle;
  disabled?: boolean;
  type?: 'input' | 'textarea' | 'password';
  rows?: number; // Only used when type="textarea"
}

export const GroupedInputItem = forwardRef<TextInput, GroupedInputItemProps>(
  (
    {
      label: labelProp,
      error,
      icon: iconProp,
      rightComponent: rightComponentProp,
      secureTextEntry: secureTextEntryProp,
      inputStyle,
      labelStyle,
      errorStyle,
      disabled,
      type = 'input',
      rows = 3,
      onFocus,
      onBlur,
      placeholder,
      ...props
    },
    ref,
  ) => {
    const t = useTranslations();
    const [showPassword, setShowPassword] = useState(false);
    const [, setIsFocused] = useState(false);

    const { colors } = useTheme();
    const text = colors.foreground;
    const muted = colors.mutedForeground;
    const primary = colors.accentYellow;
    const danger = colors.destructive;

    // Default values
    const label =
      type === 'password'
        ? labelProp === null
          ? undefined
          : (labelProp ?? upperFirst(t('common.form.password.label')))
        : labelProp;
    const icon = type === 'password' ? (iconProp ?? Icons.Password) : iconProp;
    const secureTextEntry = type === 'password' ? !showPassword : secureTextEntryProp;
    const rightComponent =
      type === 'password' ? (
        <Pressable onPress={() => setShowPassword((prev) => !prev)}>
          {showPassword ? (
            <Icons.EyeOff size={16} color={colors.mutedForeground} />
          ) : (
            <Icons.Eye size={16} color={colors.mutedForeground} />
          )}
        </Pressable>
      ) : (
        rightComponentProp
      );

    const handleFocus = (e: FocusEvent) => {
      setIsFocused(true);
      onFocus?.(e);
    };

    const handleBlur = (e: BlurEvent) => {
      if (showPassword) setShowPassword(false);
      setIsFocused(false);
      onBlur?.(e);
    };

    const renderRightComponent = () => {
      if (!rightComponent) return null;
      return typeof rightComponent === 'function' ? rightComponent() : rightComponent;
    };

    const renderItemContent = () => (
      <View>
        <Pressable
          onPress={() => ref && 'current' in ref && ref.current?.focus()}
          disabled={disabled}
          style={{ opacity: disabled ? 0.6 : 1 }}
        >
          <View
            style={{
              flexDirection: type === 'textarea' ? 'column' : 'row',
              alignItems: type === 'textarea' ? 'stretch' : 'center',
              backgroundColor: 'transparent',
            }}
          >
            {type === 'textarea' ? (
              // Textarea Layout (Column)
              <>
                {/* Header section with icon, label, and right component */}
                {(icon || label || rightComponent) && (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      marginBottom: 8,
                      gap: 8,
                    }}
                  >
                    {/* Icon & Label */}
                    <View
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                      pointerEvents="none"
                    >
                      {icon && <Icon name={icon} size={16} color={error ? danger : muted} />}
                      {label && (
                        <Text
                          numberOfLines={1}
                          ellipsizeMode="tail"
                          style={[
                            {
                              color: error ? danger : muted,
                            },
                            labelStyle,
                          ]}
                          pointerEvents="none"
                        >
                          {label}
                        </Text>
                      )}
                    </View>

                    {/* Right Component */}
                    {renderRightComponent()}
                  </View>
                )}

                {/* Textarea Input */}
                <TextInput
                  ref={ref}
                  multiline
                  numberOfLines={rows}
                  style={[
                    {
                      fontSize: FONT_SIZE,
                      lineHeight: 20,
                      color: disabled ? muted : error ? danger : text,
                      textAlignVertical: 'top',
                      paddingVertical: 0,
                      minHeight: rows * 20,
                    },
                    inputStyle,
                  ]}
                  placeholderTextColor={error ? danger + '99' : muted}
                  placeholder={placeholder || 'Type your message...'}
                  editable={!disabled}
                  selectionColor={primary}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  secureTextEntry={secureTextEntry}
                  {...props}
                />
              </>
            ) : (
              // Input Layout (Row)
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                {/* Icon & Label */}
                <View
                  style={{
                    width: label ? 120 : 'auto',
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                  }}
                  pointerEvents="none"
                >
                  {icon && <Icon name={icon} size={16} color={error ? danger : muted} />}
                  {label && (
                    <Text
                      numberOfLines={1}
                      ellipsizeMode="tail"
                      style={[
                        {
                          color: error ? danger : muted,
                        },
                        labelStyle,
                      ]}
                      pointerEvents="none"
                    >
                      {label}
                    </Text>
                  )}
                </View>

                {/* Input */}
                <View style={{ flex: 1 }}>
                  <TextInput
                    ref={ref}
                    style={[
                      {
                        flex: 1,
                        fontSize: FONT_SIZE,
                        color: disabled ? muted : error ? danger : text,
                        paddingVertical: 0,
                      },
                      inputStyle,
                    ]}
                    placeholder={placeholder}
                    placeholderTextColor={error ? danger + '99' : muted}
                    editable={!disabled}
                    selectionColor={primary}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    secureTextEntry={secureTextEntry}
                    {...props}
                  />
                </View>

                {/* Right Component */}
                {renderRightComponent()}
              </View>
            )}
          </View>
        </Pressable>
        {/* Error Message */}
        {error && (
          <Text
            style={[
              {
                marginTop: 4,
                fontSize: 14,
                color: danger,
              },
              errorStyle,
            ]}
          >
            {error}
          </Text>
        )}
      </View>
    );

    return renderItemContent();
  },
);
GroupedInputItem.displayName = 'GroupedInputItem';
