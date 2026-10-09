import { useTheme } from '../../providers/ThemeProvider';
import { forwardRef } from 'react';
import {
  EnrichedMarkdownTextInput as EnrichedMarkdownTextInputBase,
  EnrichedMarkdownTextInputInstance,
  EnrichedMarkdownTextInputProps,
} from 'react-native-enriched-markdown';
import { useMarkdownStyle } from '../../hooks/useMarkdownStyle';

const EnrichedMarkdownTextInput = forwardRef<
  EnrichedMarkdownTextInputInstance,
  EnrichedMarkdownTextInputProps
>(({ style, placeholderTextColor, markdownStyle, ...props }, ref) => {
  const { colors } = useTheme();
  const markdownStyleDefault = useMarkdownStyle();
  return (
    <EnrichedMarkdownTextInputBase
      ref={ref as any}
      style={{
        color: colors.foreground,
        ...style,
      }}
      markdownStyle={{
        ...markdownStyleDefault,
        ...markdownStyle,
      }}
      placeholderTextColor={placeholderTextColor || colors.mutedForeground}
      {...props}
    />
  );
});
EnrichedMarkdownTextInput.displayName = 'EnrichedMarkdownTextInput';

export { EnrichedMarkdownTextInput };
