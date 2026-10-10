import Colors, { TColors } from '../constants/colors';
import { DarkTheme, ThemeProvider as NativeThemeProvider } from 'expo-router/react-navigation';
import { createContext, use, useEffect, useMemo } from 'react';
import { setBackgroundColorAsync } from 'expo-system-ui';
import { Appearance, Platform, useColorScheme } from 'react-native';
import { isLiquidGlassAvailable as utilsIsLiquidGlassAvailable } from 'expo-glass-effect';
import { setStyle as setNavigationBarStyle } from 'expo-navigation-bar';
import { NativeStackNavigationOptions } from 'expo-router';
import { Theme, theme } from '../theme';
import { ThemeVariant, useUIStore } from '../stores/useUIStore';

type ThemeMode = 'light' | 'dark';

type ThemeContextType = {
  colors: TColors;
  theme: Theme;
  mode: ThemeMode;
  themePreference: ThemeVariant;
  setThemePreference: (preference: ThemeVariant) => void;
  defaultScreenOptions: NativeStackNavigationOptions;
  isLiquidGlassAvailable: boolean;
};

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

type ThemeProviderProps = {
  children?: React.ReactNode;
};

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const isLiquidGlassAvailable = utilsIsLiquidGlassAvailable();
  const themePreference = useUIStore((state) => state.theme);
  const setThemePreference = useUIStore((state) => state.setTheme);
  const systemScheme = useColorScheme();

  const mode = useMemo((): ThemeMode => {
    if (themePreference === 'system') {
      return systemScheme === 'dark' ? 'dark' : 'light';
    }
    return themePreference;
  }, [themePreference, systemScheme]);

  const colors = Colors[mode];

  const defaultScreenOptions = useMemo<NativeStackNavigationOptions>(
    () => ({
      animation: 'ios_from_right',
      headerShown: true,
      headerTintColor: colors.foreground,
      headerStyle: {
        backgroundColor: colors.background,
        // backgroundColor: isLiquidGlassAvailable ? 'transparent' : colors.background,
      },
      contentStyle: {
        backgroundColor: colors.background,
        // backgroundColor: isLiquidGlassAvailable ? 'transparent' : colors.background,
      },
      headerShadowVisible: false,
      headerTitleAlign: 'center',
      headerBackButtonDisplayMode: 'minimal',
    }),
    [colors],
  );

  useEffect(() => {
    // "system" clears any forced override so native components (including
    // @expo/ui's SwiftUI-backed ones) resolve their own appearance from the
    // OS again, instead of staying pinned to whatever mode was last forced.
    Appearance.setColorScheme(themePreference === 'system' ? 'unspecified' : themePreference);
    if (Platform.OS === 'android') {
      setNavigationBarStyle(mode);
    }
  }, [themePreference, mode]);

  useEffect(() => {
    setBackgroundColorAsync(colors.background);
  }, [colors]);

  return (
    <NativeThemeProvider
      value={{
        dark: mode === 'dark',
        colors: {
          ...DarkTheme.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.muted,
          text: colors.foreground,
          border: colors.border,
          notification: colors.primary,
        },
        fonts: DarkTheme.fonts,
      }}
    >
      <ThemeContext.Provider
        value={{
          colors,
          defaultScreenOptions,
          mode,
          themePreference,
          setThemePreference,
          theme: theme,
          isLiquidGlassAvailable,
        }}
      >
        {children}
      </ThemeContext.Provider>
    </NativeThemeProvider>
  );
};

export const useTheme = () => {
  const context = use(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
