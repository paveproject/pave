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
import { useUIStore } from '../stores/useUIStore';
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
  const hasOnboarded = useUIStore((state) => state.hasOnboarded);
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
    <Stack
      initialRouteName={hasOnboarded ? '(tabs)' : 'onboarding'}
      screenOptions={defaultScreenOptions}
    >
      <Stack.Protected guard={!hasOnboarded}>
        <Stack.Screen
          name="onboarding"
          options={{ headerShown: false, animation: 'slide_from_bottom', animationDuration: 250 }}
        />
      </Stack.Protected>
      <Stack.Protected guard={hasOnboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        {/* REPORT - half/full sheet (not 'fitToContents' like the other
            formSheets below) since its content is a scrollable grid, not a
            form that should size to itself. `headerShown: false` because
            `app/report/_layout.tsx` is a nested stack that owns the headers
            for its two steps (pick a family, then a type) - leaving this one
            on would draw a second header above them. */}
        <Stack.Screen
          name="report"
          options={{
            headerShown: false,
            presentation: 'formSheet',
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.5, 1],
            sheetInitialDetentIndex: 0,
            ...(isLiquidGlassAvailable ? { contentStyle: { backgroundColor: 'transparent' } } : {}),
          }}
        />
        {/* SETTINGS-MAP - fits its content (one segmented control), unlike
            REPORT's scrollable grid above, so 'fitToContents' like the
            other formSheets below instead of an explicit detents array. */}
        <Stack.Screen
          name="settings-map"
          options={{
            title: t('pages.map.settings.title'),
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
          {/* Pushed from the sheet above (see its "Use my recovery phrase"
              option) - its own dismissible formSheet, unlike `/welcome`'s:
              getting the phrase wrong, or changing your mind, isn't
              destructive, so there's no reason to trap the user in it. */}
          <Stack.Screen
            name="validation/own-device/recovery-phrase/[id]"
            options={{
              title: t('pages.pending_actions.own_device.mnemonic.title'),
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
        {/* WELCOME (see hooks/gates/useWelcomeGate) - grabber + gesture dismiss
            are OFF, same reasoning as the VALIDATION sheets above: this is
            mandatory, not just another formSheet the user can swipe away. */}
        <Stack.Protected guard={!!user}>
          <Stack.Screen
            name="welcome"
            options={{
              headerShown: false,
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
      </Stack.Protected>
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
