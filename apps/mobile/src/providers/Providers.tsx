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
import { PermissionsProvider } from './PermissionsProvider';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReanimatedScreenProvider } from 'react-native-screens/reanimated';
import { ToastProvider } from '../components/Toast';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ApiProvider } from './ApiProvider';
import { SyncProvider } from './sync';
import { useAppVersionCheck } from '../hooks/useAppVersionCheck';
import { useUserEventsSocket } from '../hooks/websocket/useUserEventsSocket';

type ProvidersProps = {
  children: React.ReactNode;
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
                    <PermissionsProvider>
                      <LocationProvider>
                        <ActionSheetProvider>
                          <ReactQueryProvider>
                            <AuthProvider>
                              <ApiProvider>
                                <BottomSheetModalProvider>
                                  <NotificationsProvider>
                                    {children}
                                    <BottomSheetManager />
                                    <SyncProvider />
                                    <AppVersionCheckBootstrap />
                                    <UserEventsBootstrap />
                                  </NotificationsProvider>
                                </BottomSheetModalProvider>
                              </ApiProvider>
                            </AuthProvider>
                          </ReactQueryProvider>
                        </ActionSheetProvider>
                      </LocationProvider>
                    </PermissionsProvider>
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
