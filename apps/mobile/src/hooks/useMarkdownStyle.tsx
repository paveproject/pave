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
        color: colors.accentPink,
      },
      strong: {
        color: colors.accentYellow,
      },
      list: {
        color: colors.foreground,
      },
    }),
    [colors],
  );
};
