import { Text } from './text';
import { View } from './view';
import { useTheme } from '../../providers/ThemeProvider';
import { HEIGHT } from '../../theme/globals';
import { Check } from 'lucide-react-native';
import React from 'react';
import { TextStyle, TouchableOpacity } from 'react-native';
import * as Haptics from 'expo-haptics';

interface CheckboxProps {
  checked: boolean;
  label?: string;
  error?: string;
  disabled?: boolean;
  labelStyle?: TextStyle;
  onCheckedChange: (checked: boolean) => void;
  haptic?: boolean;
}

export function Checkbox({
  checked,
  error,
  disabled = false,
  label,
  labelStyle,
  onCheckedChange,
  haptic = true,
}: CheckboxProps) {
  const { colors } = useTheme();
  const primary = colors.primary;
  const primaryForegroundColor = colors.primaryForeground;
  const danger = colors.destructive;
  const borderColor = colors.border;

  // Trigger haptic feedback
  const triggerHapticFeedback = () => {
    if (haptic && !disabled) {
      if (process.env.EXPO_OS === 'ios') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    }
  };

  const handlePress = () => {
    triggerHapticFeedback();
    if (!disabled) {
      onCheckedChange(!checked);
    }
  };

  return (
    <TouchableOpacity
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
        paddingVertical: 4,
      }}
      onPress={handlePress}
      disabled={disabled}
    >
      <View
        style={{
          width: HEIGHT / 2,
          height: HEIGHT / 2,
          borderRadius: HEIGHT / 2,
          borderWidth: 1.5,
          borderColor: checked ? primary : borderColor,
          backgroundColor: checked ? primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: label ? 8 : 0,
        }}
      >
        {checked && (
          <Check
            size={HEIGHT / 3}
            color={primaryForegroundColor}
            strokeWidth={3}
            strokeLinecap="round"
          />
        )}
      </View>
      {label && (
        <Text
          variant="caption"
          numberOfLines={1}
          ellipsizeMode="tail"
          style={[
            {
              color: error ? danger : primary,
            },
            labelStyle,
          ]}
          pointerEvents="none"
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}
