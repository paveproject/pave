import { useCallback } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { useUIStore } from '../../../stores/useUIStore';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../constants/IconsOld';

/**
 * Expo Router builds one stack per segment of this folder's name, each with
 * the whole subtree registered - so every route below is reachable from the
 * `settings` tab and from the `protest-mode` tab alike, in that tab, with the
 * tab bar still up. An href without a group picks the copy in the tab the
 * caller is already on.
 *
 * Hence an anchor per segment rather than one `initialRouteName`: the two
 * stacks bottom out on different screens.
 */
export const unstable_settings = {
  anchor: 'settings/index',
  settings: { anchor: 'settings/index' },
  'protest-mode': { anchor: 'protest-mode/index' },
};

const TabStackLayout = () => {
  const t = useTranslations();
  const router = useRouter();
  const { defaultScreenOptions, isLiquidGlassAvailable, theme } = useTheme();
  const { user } = useAuth();
  const debug = useUIStore((state) => state.debug);

  const goToSessions = useCallback(() => {
    router.push('/protest-mode/sessions');
  }, [router]);

  const goToProtestSettings = useCallback(() => {
    router.push('/settings/protest-mode');
  }, [router]);

  return (
    <Stack screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="protest-mode/index"
        options={{
          title: t('pages.protest_mode.title'),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spaces.sm }}>
              <Button
                variant="ghost"
                size="icon"
                icon={Icons.List}
                onPress={goToSessions}
                accessibilityLabel={t('pages.protest_mode.sessions.title')}
              />
              <Button
                variant="ghost"
                size="icon"
                icon={Icons.settings}
                onPress={goToProtestSettings}
                accessibilityLabel={t('pages.settings.protest_mode.title')}
              />
            </View>
          ),
          unstable_headerRightItems: () => [
            {
              type: 'button' as const,
              label: t('pages.protest_mode.sessions.title'),
              onPress: goToSessions,
              icon: { name: 'list.bullet', type: 'sfSymbol' as const },
            },
            {
              type: 'button' as const,
              label: t('pages.settings.protest_mode.title'),
              onPress: goToProtestSettings,
              icon: { name: 'gearshape', type: 'sfSymbol' as const },
            },
          ],
        }}
      />
      <Stack.Screen
        name="settings/index"
        options={{ title: t('messages.settings'), headerLargeTitleEnabled: true }}
      />
      <Stack.Screen name="settings/appearance" options={{ title: t('messages.appearance') }} />
      <Stack.Screen name="settings/permissions" options={{ title: t('messages.permissions') }} />
      <Stack.Screen name="settings/mesh-relay" options={{ title: t('messages.mesh_relay') }} />
      <Stack.Protected guard={!!user}>
        <Stack.Screen
          name="protest-mode/sessions"
          options={{ title: t('pages.protest_mode.sessions.title') }}
        />
        <Stack.Screen name="settings/account" options={{ title: t('messages.account') }} />
        <Stack.Screen
          name="settings/trusted-contacts"
          options={{ title: t('messages.trusted_contacts') }}
        />
        <Stack.Screen name="settings/devices" options={{ title: t('messages.devices') }} />
        <Stack.Screen name="settings/recovery" options={{ title: t('messages.recovery') }} />
        <Stack.Screen
          name="settings/protest-mode"
          options={{ title: t('pages.settings.protest_mode.title') }}
        />
        <Stack.Screen
          name="settings/account/change-email"
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
          name="settings/trusted-contact/add"
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
        <Stack.Screen
          name="trusted-contact/[id]/index"
          options={{ title: t('messages.trusted_contact') }}
        />
        <Stack.Screen
          name="trusted-contact/[id]/protest-sessions"
          options={{ title: t('messages.protest_sessions') }}
        />
        <Stack.Screen
          name="protest-session/[id]/index"
          options={{ title: t('pages.protest_mode.sessions.detail') }}
        />
        <Stack.Screen
          name="protest-session/[id]/audios"
          options={{ title: t('pages.protest_mode.sessions.audio_recordings') }}
        />
        <Stack.Screen
          name="protest-session/[id]/videos"
          options={{ title: t('pages.protest_mode.sessions.videos') }}
        />
        <Stack.Screen
          name="protest-session/[id]/trace"
          options={{
            title: t('pages.protest_mode.sessions.trace'),
            headerTransparent: true,
            headerStyle: { backgroundColor: 'transparent' },
          }}
        />
      </Stack.Protected>

      <Stack.Protected guard={debug}>
        <Stack.Screen name="settings/debug" options={{ title: 'Debug' }} />
        <Stack.Screen name="settings/debug/recovery-keys" options={{ title: 'Recovery keys' }} />
        <Stack.Screen name="settings/debug/sync/index" options={{ title: 'Sync' }} />
        <Stack.Screen name="settings/debug/sync/outbox" options={{ title: 'Outbox' }} />
        <Stack.Screen name="settings/debug/sync/log" options={{ title: 'Recent activity' }} />
        <Stack.Screen name="settings/debug/mesh" options={{ title: 'Mesh relay' }} />
      </Stack.Protected>
    </Stack>
  );
};

export default TabStackLayout;
