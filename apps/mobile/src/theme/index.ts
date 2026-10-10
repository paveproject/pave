import * as Device from 'expo-device';

const SPACE_SCALE = 1.33;
const FONT_SCALE = 1.2;

const isIpad = Device.osName === 'iPadOS';
export const spaceScale = <T extends number>(value: T): T =>
  (isIpad ? Math.round(value * SPACE_SCALE) : value) as T;

export const fontScale = <T extends number>(size: T): T =>
  (isIpad ? Math.round(size * FONT_SCALE) : size) as T;

const theme = {
  spaces: {
    // constants
    vertical: spaceScale(16),
    horizontal: spaceScale(16),
    // others
    xs: spaceScale(2),
    sm: spaceScale(4),
    md: spaceScale(8),
    lg: spaceScale(12),
    xl: spaceScale(16),
    '2xl': spaceScale(24),
    '3xl': spaceScale(32),
    '4xl': spaceScale(48),
  },
  fonts: {
    sizes: {
      xs: fontScale(12),
      sm: fontScale(14),
      md: fontScale(16),
      lg: fontScale(18),
      xl: fontScale(20),
      '2xl': fontScale(24),
      '3xl': fontScale(30),
      '4xl': fontScale(36),
    },
    families: {
      light: 'Montserrat-Light',
      lightItalic: 'Montserrat-LightItalic',
      regular: 'Montserrat-Medium',
      regularItalic: 'Montserrat-MediumItalic',
      semiBold: 'Montserrat-SemiBold',
      semiBoldItalic: 'Montserrat-SemiBoldItalic',
      bold: 'Montserrat-Bold',
      boldItalic: 'Montserrat-BoldItalic',
    },
  },
  border: {
    radius: {
      xs: spaceScale(4),
      sm: spaceScale(6),
      md: spaceScale(8),
      lg: spaceScale(12),
      xl: spaceScale(16),
      '2xl': spaceScale(24),
      full: 9999,
    },
  },
  input: {
    height: {
      sm: spaceScale(40),
      md: spaceScale(48),
      lg: spaceScale(56),
    },
  },
  cards: {
    widths: {
      sm: spaceScale(100),
      md: spaceScale(150),
      lg: spaceScale(200),
    },
    heights: {
      sm: spaceScale(60),
      md: spaceScale(80),
      lg: spaceScale(200),
    },
  },
  icons: {
    sizes: {
      sm: spaceScale(16),
      md: spaceScale(24),
      lg: spaceScale(32),
    },
  },
} as const;

export { theme };
export type Theme = typeof theme;
