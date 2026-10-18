import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { AuthProvider, useAuth } from './AuthProvider';
import { ReactQueryProvider } from './ReactQueryProvider';
import { ThemeProvider } from './ThemeProvider';
import { BottomSheetManager } from '../components/bottom-sheets/BottomSheetManager';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { SplashScreenProvider } from './SplashScreenProvider';
import { LocaleProvider } from './LocaleProvider';
import { LocationProvider } from './LocationProvider';
import { NotificationsProvider } from './NotificationsProvider';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReanimatedScreenProvider } from 'react-native-screens/reanimated';
import { ToastProvider } from '../components/Toast';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ApiProvider } from './ApiProvider';
import { useReportSync } from '../hooks/sync/useReportSync';
import { useMeSync } from '../hooks/sync/useMeSync';
import { useAppVersionCheck } from '../hooks/useAppVersionCheck';
import { useUserEventsSocket } from '../hooks/websocket/useUserEventsSocket';
import { useRecoveryKeySync } from '../hooks/sync/useRecoveryKeySync';
import { useReceiveShares } from '../hooks/sync/useReceiveShares';
import { useRecoveryRequestCompletion } from '../hooks/sync/useRecoveryRequestCompletion';

type ProvidersProps = {
  children: React.ReactNode;
};

// Renders nothing - just wires the reconnect listener that retries
// not-yet-synced local reports (see lib/watermelon/reports.ts).
const ReportSyncBootstrap = () => {
  useReportSync();
  return null;
};

// Same idea, for every offline-first `/me` field (language, protest mode,
// ...) that couldn't be pushed to the account yet - see
// `stores/useMeSyncStore.ts`'s own doc comment for the full mechanism.
const MeSyncBootstrap = () => {
  useMeSync();
  return null;
};

// Same idea, for the outdated-app-version check (see useAppVersionCheck).
const AppVersionCheckBootstrap = () => {
  useAppVersionCheck();
  return null;
};

// Same idea, for the personal realtime channel (see
// apps/api/src/app/me/events) - connects once logged in, for the app's
// lifetime, regardless of which screen is open.
const UserEventsBootstrap = () => {
  const { user } = useAuth();
  useUserEventsSocket(!!user);
  return null;
};

// Same idea, for the recovery-key machinery (see lib/recoveryKey) - keeps
// this user's own key split across their trusted contacts and decrypts
// shares entrusted to this device, app-wide regardless of which screen
// is open. Both hooks gate on auth themselves. Catches up a rotation
// missed by the realtime event (app was closed when it fired) on next
// launch, instead of only when the user happens to revisit those
// specific settings screens.
const RecoveryKeyBootstrap = () => {
  useRecoveryKeySync();
  useReceiveShares();
  useRecoveryRequestCompletion();
  return null;
};

const Providers = ({ children }: ProvidersProps) => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ReanimatedScreenProvider>
        <KeyboardProvider>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <SplashScreenProvider>
              <LocaleProvider>
                <ThemeProvider>
                  <ToastProvider>
                    <LocationProvider>
                      <ActionSheetProvider>
                        <ReactQueryProvider>
                          <AuthProvider>
                            <ApiProvider>
                              <BottomSheetModalProvider>
                                <NotificationsProvider>
                                  {children}
                                  <BottomSheetManager />
                                  <ReportSyncBootstrap />
                                  <MeSyncBootstrap />
                                  <AppVersionCheckBootstrap />
                                  <UserEventsBootstrap />
                                  <RecoveryKeyBootstrap />
                                </NotificationsProvider>
                              </BottomSheetModalProvider>
                            </ApiProvider>
                          </AuthProvider>
                        </ReactQueryProvider>
                      </ActionSheetProvider>
                    </LocationProvider>
                  </ToastProvider>
                </ThemeProvider>
              </LocaleProvider>
            </SplashScreenProvider>
          </SafeAreaProvider>
        </KeyboardProvider>
      </ReanimatedScreenProvider>
    </GestureHandlerRootView>
  );
};

export { Providers };
