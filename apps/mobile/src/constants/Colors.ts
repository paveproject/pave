export type ColorTheme = {
  foreground: string;
  background: string;
  primary: string;
  primarySubued: string;
  primaryForeground: string;
  muted: string;
  mutedForeground: string;
  border: string;
  card: string;
  cardForeground: string;
  destructive: string;
  destructiveForeground: string;
  success: string;
  successForeground: string;
  tint: string;
  toast: string;
  keyboardToolbarBackground: string;
  // Accent colors
  accentYellow: string;
  accentYellowForeground: string;
  accentYellowHover: string;
  accentBlue: string;
  accentBlueForeground: string;
  accentBlueHover: string;
  accentPink: string;
  accentPinkForeground: string;
  accentPinkHover: string;
  accentGreen: string;
  accentGreenForeground: string;
  accentGreenHover: string;
  accentOrange: string;
  accentOrangeForeground: string;
  accentOrangeHover: string;
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
    muted: 'hsl(0 0% 8%)',
    mutedForeground: 'hsl(0 0% 57%)',
    border: 'hsl(240 3.7% 15.9%)',
    card: 'hsl(0 0% 8%)',
    cardForeground: sharedColors.white,
    destructive: 'hsl(358.75 100% 70%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    success: 'hsl(144.07 100% 39%)',
    successForeground: 'hsl(0 0% 98%)',
    tint: 'hsl(0 0% 100%)',
    toast: 'hsl(0 0% 15%)',
    keyboardToolbarBackground: 'hsl(0 0% 12%)',
    // Accent colors
    accentYellow: 'hsl(51 100% 73%)',
    accentYellowForeground: sharedColors.black,
    accentYellowHover: 'hsl(44 97% 40%)',
    accentBlue: 'hsl(216, 100%, 58%)',
    accentBlueForeground: sharedColors.white,
    accentBlueHover: 'hsl(212 100% 30%)',
    accentPink: 'hsl(320 87% 75%)',
    accentPinkForeground: sharedColors.black,
    accentPinkHover: 'hsl(320 89% 57%)',
    accentGreen: 'hsl(145 63% 49%)',
    accentGreenForeground: sharedColors.black,
    accentGreenHover: 'hsl(145 63% 30%)',
    accentOrange: 'hsl(28 100% 62%)',
    accentOrangeForeground: sharedColors.white,
    accentOrangeHover: 'hsl(24 100% 40%)',
    ...sharedColors,
  },
  light: {
    foreground: 'hsl(240 10% 3.9%)',
    background: 'hsl(0 0% 100%)',
    primary: 'hsla(51, 100%, 50%, 1.00)',
    primarySubued: 'hsl(0 0% 65%)',
    primaryForeground: sharedColors.black,
    muted: 'hsla(0, 0%, 80%, 1.00)',
    mutedForeground: 'hsla(0, 0%, 20%, 1.00)',
    border: 'hsla(240, 7%, 65%, 1.00)',
    card: 'hsla(0, 0%, 76%, 1.00)',
    cardForeground: sharedColors.black,
    destructive: 'hsl(358.75 100% 70%)',
    destructiveForeground: 'hsl(0 0% 98%)',
    success: 'hsl(144.07 100% 39%)',
    successForeground: 'hsl(0 0% 98%)',
    tint: 'hsl(240 5.9% 10%)',
    toast: 'hsl(0 0% 15%)',
    keyboardToolbarBackground: 'hsl(240 10% 8%)',
    // Accent colors
    accentYellow: 'hsl(51 100% 73%)',
    accentYellowForeground: sharedColors.black,
    accentYellowHover: 'hsl(44 97% 40%)',
    accentBlue: 'hsl(216, 100%, 58%)',
    accentBlueForeground: sharedColors.white,
    accentBlueHover: 'hsl(212 100% 30%)',
    accentPink: 'hsl(320 87% 75%)',
    accentPinkForeground: sharedColors.black,
    accentPinkHover: 'hsl(320 89% 57%)',
    accentGreen: 'hsl(145 63% 49%)',
    accentGreenForeground: sharedColors.black,
    accentGreenHover: 'hsl(145 63% 30%)',
    accentOrange: 'hsl(28 100% 62%)',
    accentOrangeForeground: sharedColors.white,
    accentOrangeHover: 'hsl(24 100% 40%)',
    ...sharedColors,
  },
};

export default Colors;
