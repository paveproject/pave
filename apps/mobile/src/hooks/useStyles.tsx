import { TColors } from '../constants/Colors';
import { useTheme } from '../providers/ThemeProvider';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';

interface Styles<T extends StyleSheet.NamedStyles<T>> {
  colors: TColors;
  styles: T;
}

export default function <T extends StyleSheet.NamedStyles<T>>(
  createStyle: (colors: TColors) => T,
): Styles<T> {
  const { colors } = useTheme();

  return {
    colors: colors,
    styles: useMemo(() => createStyle(colors), [colors, createStyle]),
  };
}
