import { useTheme } from '../../providers/ThemeProvider';
import { useMemo } from 'react';
import {
  DefaultKeyboardToolbarTheme,
  KeyboardToolbar as RNKeyboardToolbar,
} from 'react-native-keyboard-controller';
import { KeyboardToolbarTheme } from 'react-native-keyboard-controller/lib/typescript/components/KeyboardToolbar/types';

const KeyboardToolbarBase = ({
  theme,
  ...props
}: React.ComponentPropsWithoutRef<typeof RNKeyboardToolbar>) => {
  const { colors } = useTheme();
  const themeDefault: KeyboardToolbarTheme = useMemo(
    () => ({
      ...DefaultKeyboardToolbarTheme,
      dark: {
        ...DefaultKeyboardToolbarTheme.dark,
        background: colors.keyboardToolbarBackground,
        primary: colors.foreground,
      },
      light: {
        ...DefaultKeyboardToolbarTheme.light,
        background: colors.keyboardToolbarBackground,
        primary: colors.foreground,
      },
      ...theme,
    }),
    [colors, theme],
  );
  return <RNKeyboardToolbar theme={themeDefault} {...props} />;
};

export const KeyboardToolbar = Object.assign(KeyboardToolbarBase, {
  Content: RNKeyboardToolbar.Content,
  Next: RNKeyboardToolbar.Next,
  Prev: RNKeyboardToolbar.Prev,
  Done: RNKeyboardToolbar.Done,
});
