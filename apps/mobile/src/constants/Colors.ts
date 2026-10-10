export type ColorTheme = {
  foreground: string;
  background: string;
  primary: string;
  primarySubued: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  card: string;
  cardForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  warning: string;
  warningForeground: string;
  tint: string;
  keyboardToolbarBackground: string;
};

const sharedColors = {
  black: 'hsl(0 0% 0%)',
  white: 'hsl(0 0% 100%)',
};

type SharedColors = typeof sharedColors;

export type TColors = ColorTheme & SharedColors;

type ColorPalettes = {
  light: TColors;
  dark: TColors;
};

const Colors: ColorPalettes = {
  dark: {
    foreground: 'hsl(0 0% 98%)',
    background: 'hsl(0 10% 3.9%)',
    primary: 'hsl(51 100% 73%)',
    primarySubued: 'hsl(0 0% 65%)',
    primaryForeground: sharedColors.black,
    secondary: sharedColors.white,
    secondaryForeground: sharedColors.black,
    muted: 'hsl(0 0% 8%)',
    mutedForeground: 'hsl(0 0% 57%)',
    border: 'hsl(240 3.7% 15.9%)',
    card: 'hsl(0 0% 8%)',
    cardForeground: sharedColors.white,
    destructive: 'hsl(358.75 100% 70%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    success: 'hsl(144.07 100% 39%)',
    successForeground: 'hsl(0 0% 98%)',
    warning: 'hsl(48 100% 50%)',
    warningForeground: sharedColors.black,
    tint: 'hsl(0 0% 100%)',
    keyboardToolbarBackground: 'hsl(0 0% 12%)',
    ...sharedColors,
  },
  light: {
    foreground: 'hsl(240 10% 3.9%)',
    background: 'hsl(0 0% 100%)',
    primary: 'hsla(51, 100%, 50%, 1.00)',
    primarySubued: 'hsl(0 0% 65%)',
    primaryForeground: sharedColors.black,
    secondary: sharedColors.black,
    secondaryForeground: sharedColors.white,
    muted: 'hsla(0, 0%, 95%, 1.00)',
    mutedForeground: 'hsla(0, 0%, 20%, 1.00)',
    border: 'hsla(240, 7%, 65%, 1.00)',
    card: 'hsla(0, 0%, 76%, 1.00)',
    cardForeground: sharedColors.black,
    destructive: 'hsl(358.75 100% 70%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    success: 'hsl(144.07 100% 39%)',
    successForeground: 'hsl(0 0% 98%)',
    warning: 'hsl(48 100% 50%)',
    warningForeground: sharedColors.black,
    tint: 'hsl(240 5.9% 10%)',
    keyboardToolbarBackground: 'hsl(240 10% 8%)',
    ...sharedColors,
  },
};

export default Colors;
