import { useTheme } from '../../providers/ThemeProvider';
import { FONT_SIZE } from '../../theme/globals';
import React, { forwardRef, useMemo } from 'react'; // Importer useMemo
import { Text as RNText, TextProps as RNTextProps, TextStyle } from 'react-native';

type TextVariant = 'body' | 'title' | 'subtitle' | 'caption' | 'heading' | 'link';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  /**
   * The color variant of the text.
   * @default 'foreground'
   */
  textColor?: 'default' | 'foreground' | 'muted' | 'destructive';
  children: React.ReactNode;
}

/**
 * Component for displaying text with different styles.
 * It supports various variants and text colors.
 * @param {TextProps["textColor"]} textColor - The color variant of the text. Set to 'foreground' if not specified.
 * @returns {JSX.Element} The rendered component.
 *
 */
export const Text = forwardRef<RNText, TextProps>(
  ({ variant = 'body', textColor, style, children, ...props }, ref) => {
    const { colors } = useTheme();

    const textStyle = useMemo((): TextStyle => {
      const sharedStyles: TextStyle = {
        flexShrink: 1,
      };
      const variantStyles: TextStyle = (() => {
        switch (variant) {
          case 'heading':
            return { fontSize: 28, fontWeight: '800' };
          case 'title':
            return { fontSize: 24, fontWeight: '700' };
          case 'subtitle':
            return { fontSize: 19, fontWeight: '600' };
          case 'caption':
            return { fontSize: FONT_SIZE, fontWeight: '400' };
          case 'link':
            return { fontSize: FONT_SIZE, fontWeight: '500', textDecorationLine: 'underline' };
          default: // 'body'
            return { fontSize: FONT_SIZE, fontWeight: '400' };
        }
      })();

      const colorStyle: { color?: string } = {};

      if (textColor && textColor !== 'default') {
        switch (textColor) {
          case 'foreground':
            colorStyle.color = colors.foreground;
            break;
          case 'muted':
            colorStyle.color = colors.mutedForeground;
            break;
          case 'destructive':
            colorStyle.color = colors.destructive;
            break;
        }
      } else if (!textColor) {
        switch (variant) {
          case 'caption':
            colorStyle.color = colors.mutedForeground;
            break;
          default:
            colorStyle.color = colors.foreground;
            break;
        }
      }
      return { ...sharedStyles, ...variantStyles, ...colorStyle };
    }, [variant, textColor, colors]);

    return (
      <RNText ref={ref} style={[textStyle, style]} {...props}>
        {children}
      </RNText>
    );
  },
);
Text.displayName = 'Text';
