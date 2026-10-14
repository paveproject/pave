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
      {/* The "+" button and the selection-aware "remove" button are owned
          by trusted-contacts/index.tsx itself (via navigation.getParent()
          .setOptions(...)), not set statically here, since they depend on
          that screen's own selection state. */}
      <Stack.Screen name="trusted-contacts" options={{ title: t('messages.trusted_contacts') }} />
      <Stack.Screen
        name="account/change-email"
        options={{
          title: t('messages.change_email'),
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
      <Stack.Screen
        name="trusted-contact/add"
        options={{
          title: t('pages.settings.trusted_contacts.add.title'),
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
