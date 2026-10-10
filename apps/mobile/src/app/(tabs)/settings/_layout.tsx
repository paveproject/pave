import { useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { Stack } from 'expo-router';

const SettingsLayout = () => {
  const { defaultScreenOptions, isLiquidGlassAvailable } = useTheme();
  const t = useTranslations();

  return (
    <Stack initialRouteName="index" screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="index"
        options={{ title: t('messages.settings'), headerLargeTitleEnabled: true }}
      />
      <Stack.Screen name="appearance" options={{ title: t('messages.appearance') }} />
      <Stack.Screen name="account" options={{ title: t('messages.account') }} />
      <Stack.Screen
        name="account/change-email"
        options={{
          title: t('pages.settings.account.email.change'),
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
    </Stack>
  );
};

export default SettingsLayout;
