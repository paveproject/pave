import { ActionSheetProvider } from '@expo/react-native-action-sheet';
import { AuthProvider } from './AuthProvider';
import { ReactQueryProvider } from './ReactQueryProvider';
import { ThemeProvider } from './ThemeProvider';
import { BottomSheetManager } from '../components/bottom-sheets/BottomSheetManager';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { SplashScreenProvider } from './SplashScreenProvider';
import { LocaleProvider } from './LocaleProvider';
import { LocationProvider } from './LocationProvider';
import { NotificationsProvider } from './NotificationsProvider';
import { RealtimeProvider } from './RealtimeProvider';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { ReanimatedScreenProvider } from 'react-native-screens/reanimated';
import { ToastProvider } from '../components/Toast';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { ApiProvider } from './ApiProvider';
import { useReportSync } from '../hooks/useReportSync';

type ProvidersProps = {
  children: React.ReactNode;
};

// Renders nothing - just wires the reconnect listener that retries
// not-yet-synced local reports (see lib/watermelon/reports.ts).
const ReportSyncBootstrap = () => {
  useReportSync();
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
                                  <RealtimeProvider>
                                    {children}
                                    <BottomSheetManager />
                                    <ReportSyncBootstrap />
                                  </RealtimeProvider>
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
