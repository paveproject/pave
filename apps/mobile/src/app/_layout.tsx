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
import { useQuery } from '@tanstack/react-query';
import { pendingActionsOptions } from '@libs/query-client';
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
  const t = useTranslations();
  const { defaultScreenOptions, isLiquidGlassAvailable } = useTheme();
  const { data: pendingActions } = useQuery({ ...pendingActionsOptions(), enabled: !!user });

  // Coarse on purpose - "some item of this kind exists," not "this exact
  // id" - `Stack.Protected`'s guard can't see which dynamic `[id]` a
  // screen was actually pushed with. That's fine: it only has to keep the
  // route unreachable when there's truly nothing of this kind to approve
  // (a stale deep link, a back-button replay); the screen itself (via
  // `usePendingAction`) closes on the narrower "this exact item is gone".
  const hasPendingDeviceApproval = !!pendingActions?.some(
    (action) => action.kind === 'device_registration',
  );
  const hasPendingRecoveryRequestApproval = !!pendingActions?.some(
    (action) => action.kind === 'recovery_request_contact',
  );
  const hasOwnDevicePending = !!pendingActions?.some(
    (action) => action.kind === 'own_device_registration',
  );

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
            ...(isLiquidGlassAvailable
              ? {
                  contentStyle: { backgroundColor: 'transparent' },
                  headerStyle: { backgroundColor: 'transparent' },
                }
              : {}),
          }}
        />
      </Stack.Protected>
      {/* VALIDATION (see hooks/gates/usePendingActionsGate) */}
      {/* Grabber + swipe/tap-outside dismiss are OFF on all three of these -
          each screen's own header cross (`useModalHeaderOptions`/the
          Android custom header) is the only way to close without
          approving/declining, so there's exactly one dismiss path to
          reason about instead of two. */}
      <Stack.Protected guard={hasPendingDeviceApproval}>
        <Stack.Screen
          name="validation/device/[id]"
          options={{
            title: t('pages.pending_actions.device.title'),
            presentation: 'formSheet',
            sheetGrabberVisible: false,
            gestureEnabled: false,
            sheetAllowedDetents: 'fitToContents',
            sheetInitialDetentIndex: 0,
            ...(isLiquidGlassAvailable
              ? {
                  contentStyle: { backgroundColor: 'transparent' },
                  headerStyle: { backgroundColor: 'transparent' },
                }
              : {}),
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={hasPendingRecoveryRequestApproval}>
        <Stack.Screen
          name="validation/recovery-request/[id]"
          options={{
            title: t('pages.pending_actions.recovery_request.title'),
            presentation: 'formSheet',
            sheetGrabberVisible: false,
            gestureEnabled: false,
            sheetAllowedDetents: 'fitToContents',
            sheetInitialDetentIndex: 0,
            ...(isLiquidGlassAvailable
              ? {
                  contentStyle: { backgroundColor: 'transparent' },
                  headerStyle: { backgroundColor: 'transparent' },
                }
              : {}),
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={hasOwnDevicePending}>
        <Stack.Screen
          name="validation/own-device/[id]"
          options={{
            title: t('pages.pending_actions.own_device.title'),
            presentation: 'formSheet',
            sheetGrabberVisible: false,
            gestureEnabled: false,
            sheetAllowedDetents: 'fitToContents',
            sheetInitialDetentIndex: 0,
            ...(isLiquidGlassAvailable
              ? {
                  contentStyle: { backgroundColor: 'transparent' },
                  headerStyle: { backgroundColor: 'transparent' },
                }
              : {}),
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
      {/* PROTEST MODE (see (tabs)/_layout.tsx's always-visible accessory) -
          no `headerShown: false` here, unlike `welcome`: this is a flat
          route with no nested layout of its own, so it owns its header
          directly via `useModalHeaderOptions` inside the screen. */}
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="protest-mode" options={{ presentation: 'fullScreenModal' }} />
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
