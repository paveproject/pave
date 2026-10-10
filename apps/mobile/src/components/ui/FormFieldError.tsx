import { useTheme } from '../../providers/ThemeProvider';
import { Icons as LegacyIcons } from '../../constants/IconsOld';
import { View } from './view';
import { Text } from './text';
import { StatusBubble } from './StatusBubble';

interface FormFieldErrorProps {
  message?: string;
}

/**
 * Plain RN (no native @expo/ui descendant), so it can be dropped as a row
 * right below a native TextField/TextInput row - wrapping it isn't needed,
 * it's auto-bridged into the surrounding native tree.
 *
 * The outer `View` always mounts, even with no message - toggling between
 * returning `null` and a real element here changes the surrounding native
 * `FieldGroup`'s direct child *count*, and the `@expo/ui` bridge rebuilds
 * sibling native views (including whichever `TextInput` sits above it) on
 * that kind of structural change, dropping focus.
 *
 * Its size never changes after mount either, for the same bridging
 * reason: toggling `height` between `0` and content-driven once a
 * message first appears doesn't get re-measured by whatever native host
 * wraps this (`FieldGroup`'s auto-bridge, or a SwiftUI `Section`'s
 * `footer` slot) - the space never grows, so the next field crops the
 * text. The bubble+text structure (and thus the height it naturally
 * takes) is always rendered identically; only `opacity` toggles.
 */
export const FormFieldError = ({ message }: FormFieldErrorProps) => {
  const { colors, theme } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spaces.sm,
        paddingHorizontal: theme.spaces.horizontal,
        paddingVertical: theme.spaces.sm,
        opacity: message ? 1 : 0,
      }}
    >
      <StatusBubble
        color={colors.destructive}
        iconColor={colors.destructiveForeground}
        icon={LegacyIcons.AlertCircle}
      />
      <Text style={{ flex: 1, color: colors.foreground, fontSize: theme.fonts.sizes.sm }}>
        {message || ' '}
      </Text>
    </View>
  );
};
