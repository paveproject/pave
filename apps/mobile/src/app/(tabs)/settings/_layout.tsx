import { useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { useUIStore } from '../../../stores/useUIStore';
import { Stack } from 'expo-router';
import { useAuth } from '../../../providers/AuthProvider';

const SettingsLayout = () => {
  const { defaultScreenOptions, isLiquidGlassAvailable } = useTheme();
  const t = useTranslations();
  const debug = useUIStore((state) => state.debug);
  const { user } = useAuth();

  return (
    <Stack initialRouteName="index" screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="index"
        options={{ title: t('messages.settings'), headerLargeTitleEnabled: true }}
      />
      <Stack.Screen name="appearance" options={{ title: t('messages.appearance') }} />
      <Stack.Screen name="permissions" options={{ title: t('messages.permissions') }} />
      <Stack.Screen name="mesh-relay" options={{ title: t('messages.mesh_relay') }} />
      {/* Account-bound, unlike the three above, which are device settings and
          stay reachable signed out. `settings/index` only renders these rows
          for a signed-in user, so this is what stops a deep link. */}
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="account" options={{ title: t('messages.account') }} />
        <Stack.Screen name="trusted-contacts" options={{ title: t('messages.trusted_contacts') }} />
        <Stack.Screen name="devices" options={{ title: t('messages.devices') }} />
        <Stack.Screen name="recovery" options={{ title: t('messages.recovery') }} />
        <Stack.Screen
          name="protest-mode"
          options={{ title: t('pages.settings.protest_mode.title') }}
        />
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
            headerTransparent: false,
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
      </Stack.Protected>
      <Stack.Protected guard={debug}>
        <Stack.Screen name="debug" options={{ title: 'Debug' }} />
        <Stack.Screen name="debug/recovery-keys" options={{ title: 'Recovery keys' }} />
        {/* `debug/sync/{index,outbox,log}` - no `_layout.tsx` in that
            folder, registered directly here by their nested path. */}
        <Stack.Screen name="debug/sync/index" options={{ title: 'Sync' }} />
        <Stack.Screen name="debug/sync/outbox" options={{ title: 'Outbox' }} />
        <Stack.Screen name="debug/sync/log" options={{ title: 'Recent activity' }} />
        <Stack.Screen name="debug/mesh" options={{ title: 'Mesh relay' }} />
      </Stack.Protected>
    </Stack>
  );
};

export default SettingsLayout;
