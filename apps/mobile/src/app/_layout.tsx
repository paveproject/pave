// Sentry
import '../logger/sentry/setup';
import * as Sentry from '@sentry/react-native';
// API
import '../lib/api/init';

import { useEffect, useRef, useState } from 'react';
import { setAndroidNavigationBar } from '../lib/android-navigation-bar';
import { Providers } from '../providers/Providers';
import StatusBar from '../components/StatusBar';
import { useIsomorphicLayoutEffect } from '../hooks/useIsomorphicLayoutEffect';
import { configureReanimatedLogger, ReanimatedLogLevel } from 'react-native-reanimated';
import { Stack, useRouter } from 'expo-router';
import { enableFreeze, enableScreens } from 'react-native-screens';
import { useTheme } from '../providers/ThemeProvider';
import { useAuth } from '../providers/AuthProvider';
import { useTranslations } from 'use-intl';

export { ErrorBoundary } from '../providers/ErrorBoundaryProvider';

enableScreens(true);
enableFreeze(true);

configureReanimatedLogger({
  level: ReanimatedLogLevel.warn,
  strict: false,
});

const RootLayoutNav = () => {
  const { user } = useAuth();
  const router = useRouter();
  const t = useTranslations();
  const { defaultScreenOptions } = useTheme();

  useEffect(() => {
    if (user && !user.username) {
      router.push('/auth/complete');
    }
  }, [user, router]);

  return (
    <Stack initialRouteName="(tabs)" screenOptions={defaultScreenOptions}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="map"
        options={{
          animation: 'fade',
          headerTransparent: true,
          headerTitle: () => <></>,
          headerStyle: { backgroundColor: 'transparent' },
        }}
      />
      {/* AUTH */}
      <Stack.Protected guard={!user}>
        <Stack.Screen
          name="auth"
          options={{
            title: t('messages.sign_in'),
            headerTransparent: true,
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetAllowedDetents: 'fitToContents',
            sheetInitialDetentIndex: 0,
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!!user && !user.username}>
        <Stack.Screen
          name="auth/complete"
          options={{
            headerShown: false,
            presentation: 'formSheet',
            sheetGrabberVisible: false,
            sheetAllowedDetents: 'fitToContents',
            sheetInitialDetentIndex: 0,
            gestureEnabled: false,
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
