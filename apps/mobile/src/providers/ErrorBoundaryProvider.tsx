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
import { Host, Icon } from '@expo/ui';
import { buttonStyle, controlSize, tint } from '@expo/ui/swift-ui/modifiers';
import { ToastProvider, useToast } from '../components/Toast';
import { logger } from '../logger';
import { View } from '../components/ui/view';
import tw from '../lib/tw';
import { Icons } from '../constants/icons';
import { Text } from '../components/ui/text';
import { NativeButton } from '../components/ui/NativeButton';

const ErrorBoundaryInner = ({ error, retry }: ErrorBoundaryProps) => {
  const { colors, theme } = useTheme();
  const t = useTranslations();
  const toast = useToast();

  const copyError = useCallback(async () => {
    await setStringAsync(error.message);
    toast.success(t('messages.copied', { count: 1, gender: 'male' }));
  }, [error, toast, t]);

  useEffect(() => {
    logger.error(error, {
      context: 'GlobalErrorBoundary',
    });
  }, [error]);

  return (
    <View style={tw`flex-1 justify-center items-center p-4 gap-4`}>
      <Host matchContents>
        <Icon name={Icons.error} size={theme.icons.sizes.lg} color={colors.destructive} />
      </Host>
      <Text variant="title">{t('messages.an_error_occurred')}</Text>
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
      <Host matchContents>
        <NativeButton
          label={t('messages.try_again')}
          onPress={retry}
          colors={{
            containerColor: colors.destructive,
            contentColor: colors.destructiveForeground,
          }}
          iosModifiers={[
            buttonStyle('glassProminent'),
            controlSize('extraLarge'),
            tint(colors.destructive),
          ]}
        />
      </Host>
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
