import { MarkdownStyle } from 'react-native-enriched-markdown';
import { useTheme } from '../providers/ThemeProvider';
import { useMemo } from 'react';

export const useMarkdownStyle = (): MarkdownStyle => {
  const { colors } = useTheme();
  return useMemo(
    () => ({
      paragraph: {
        color: colors.foreground,
      },
      link: {
        color: colors.secondary,
      },
      strong: {
        color: colors.primary,
      },
      list: {
        color: colors.foreground,
      },
    }),
    [colors],
  );
};
