import { useTheme } from '../../providers/ThemeProvider';
import { Icons as LegacyIcons } from '../../constants/IconsOld';
import { View } from './view';
import { Text } from './text';

interface FormFieldErrorProps {
  message?: string;
}

/**
 * Plain RN (no native @expo/ui descendant), so it can be dropped as a row
 * right below a native TextField/TextInput row - wrapping it isn't needed,
 * it's auto-bridged into the surrounding native tree.
 */
export const FormFieldError = ({ message }: FormFieldErrorProps) => {
  const { colors, theme } = useTheme();

  if (!message) return null;

  const bubbleSize = theme.icons.sizes.sm + theme.spaces.sm;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spaces.sm,
        paddingHorizontal: theme.spaces.horizontal,
        paddingVertical: theme.spaces.sm,
      }}
    >
      <View
        style={{
          width: bubbleSize,
          height: bubbleSize,
          borderRadius: bubbleSize / 2,
          backgroundColor: colors.destructive,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LegacyIcons.AlertCircle size={theme.icons.sizes.sm} color={colors.destructiveForeground} />
      </View>
      <Text style={{ flex: 1, color: colors.foreground, fontSize: theme.fonts.sizes.sm }}>
        {message}
      </Text>
    </View>
  );
};
