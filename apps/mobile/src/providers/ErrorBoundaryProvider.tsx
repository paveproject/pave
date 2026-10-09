import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';
import { SplashScreenProvider } from './SplashScreenProvider';
import { LocaleProvider } from './LocaleProvider';
import { ThemeProvider, useTheme } from './ThemeProvider';
import { ErrorBoundaryProps } from 'expo-router';
import { setStringAsync } from 'expo-clipboard';
import { useTranslations } from 'use-intl';
import { useCallback, useEffect } from 'react';
import { Pressable } from 'react-native';
import { ToastProvider, useToast } from '../components/Toast';
import { logger } from '../logger';
import { View } from '../components/ui/view';
import tw from '../lib/tw';
import { Icons } from '../constants/Icons';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/Button';

const ErrorBoundaryInner = ({ error, retry }: ErrorBoundaryProps) => {
  const { colors } = useTheme();
  const t = useTranslations();
  const toast = useToast();

  const copyError = useCallback(async () => {
    await setStringAsync(error.message);
    toast.success(t('common.messages.copied', { count: 1, gender: 'male' }));
  }, [error, toast, t]);

  useEffect(() => {
    logger.error(error, {
      context: 'GlobalErrorBoundary',
    });
  }, [error]);

  return (
    <View style={tw`flex-1 justify-center items-center p-4 gap-4`}>
      <Icons.Bug color={colors.mutedForeground} />
      <Text variant="title">{t('common.messages.an_error_occurred')}</Text>
      <Pressable
        onPress={copyError}
        style={[
          tw`gap-2 p-4 rounded-md`,
          {
            backgroundColor: colors.muted,
          },
        ]}
      >
        <Text>{error.message}</Text>
      </Pressable>
      <Button onPress={retry}>{t('common.messages.try_again')}</Button>
    </View>
  );
};
export const ErrorBoundary = ({ error, retry }: ErrorBoundaryProps) => {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <SplashScreenProvider>
            <LocaleProvider>
              <ThemeProvider>
                <ToastProvider>
                  <ErrorBoundaryInner error={error} retry={retry} />
                </ToastProvider>
              </ThemeProvider>
            </LocaleProvider>
          </SplashScreenProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
};
