// Sentry
import '../logger/sentry/setup';
import * as Sentry from '@sentry/react-native';
// API
import '../lib/api/init';

import { useRef, useState } from 'react';
import { setAndroidNavigationBar } from '../lib/android-navigation-bar';
import { Providers } from '../providers/Providers';
import StatusBar from '../components/StatusBar';
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { Stack } from 'expo-router';
import { enableFreeze, enableScreens } from 'react-native-screens';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';
import { useTranslations } from 'use-intl';
import { Platform } from 'react-native';

export { ErrorBoundary } from '../providers/ErrorBoundaryProvider';

enableScreens(true);
enableFreeze(true);

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

const RootLayoutNav = () => {
  const t = useTranslations();
  const { user } = useAuth();
  const { defaultScreenOptions } = useTheme();
  return (
    <Stack initialRouteName="(tabs)" screenOptions={defaultScreenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} /> {/* AUTH */}
      <Stack.Protected guard={!user}>
        <Stack.Screen
          name="auth/(main)"
          options={{
            headerShown: false,
            presentation: Platform.select({
              ios: 'modal',
              android: 'formSheet',
              default: 'modal',
            }),
          }}
        />
        <Stack.Screen
          name="auth/(password)"
          options={{
            title: t('common.messages.forgot_password'),
            headerShown: false,
            presentation: Platform.select({
              ios: 'modal',
              android: 'formSheet',
              default: 'modal',
            }),
          }}
        />
      </Stack.Protected>
      {/* WELCOME */}
      <Stack.Protected guard={!!user}>
        <Stack.Screen
          name="welcome"
          options={{
            headerShown: false,
            presentation: 'fullScreenModal',
          }}
        />
      </Stack.Protected>
      <Stack.Screen
        name="onboarding"
        options={{ headerShown: false, animation: 'slide_from_bottom', animationDuration: 250 }}
      />
    </Stack>
  );
};

const RootLayout = () => {
  const hasMounted = useRef(false);
  const [isColorSchemeLoaded, setIsColorSchemeLoaded] = useState(false);

  // Set the Android navigation bar color
  useIsomorphicLayoutEffect(() => {
    if (hasMounted.current) {
      return;
    }
    setAndroidNavigationBar('dark');
    setIsColorSchemeLoaded(true);
    hasMounted.current = true;
  }, []);

  if (!isColorSchemeLoaded) {
    return null;
  }

  return (
    <Providers>
      <StatusBar />
      <RootLayoutNav />
    </Providers>
  );
};

export default Sentry.wrap(RootLayout);
