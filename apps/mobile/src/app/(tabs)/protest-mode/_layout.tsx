import { useCallback } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { Button } from '../../../components/ui/Button';
import { Icons } from '../../../constants/IconsOld';

/**
 * Both header forms are declared on purpose, as in
 * `settings/trusted-contacts/_layout.tsx`: `unstable_headerRightItems` renders
 * native bar items where supported, `headerRight` is the RN fallback. Only
 * `imageSource` icons work on both platforms (`sfSymbol` is iOS-only), so the
 * native items carry a `label` too - that is what Android shows and what
 * VoiceOver reads.
 */
const ProtestModeLayout = () => {
  const t = useTranslations();
  const router = useRouter();
  const { defaultScreenOptions, theme } = useTheme();
  const { user } = useAuth();

  const goToSessions = useCallback(() => {
    router.push('/(tabs)/protest-mode/sessions');
  }, [router]);

  const goToSettings = useCallback(() => {
    router.push('/(tabs)/settings/protest-mode');
  }, [router]);

  return (
    <Stack initialRouteName="index" screenOptions={defaultScreenOptions}>
      <Stack.Screen
        name="index"
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
                onPress={goToSettings}
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
              onPress: goToSettings,
              icon: { name: 'gearshape', type: 'sfSymbol' as const },
            },
          ],
        }}
      />
      {/* The recordings need an account - sealed under the account DEK and
          read back through `/user/{id}/...`. `index` stays out so the route
          still resolves while the tab is hidden (see `(tabs)/_layout.tsx`),
          which is what keeps a signed-out user out. */}
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="sessions" options={{ title: t('pages.protest_mode.sessions.title') }} />
        <Stack.Screen name="[id]" options={{ title: t('pages.protest_mode.sessions.detail') }} />
      </Stack.Protected>
    </Stack>
  );
};

export default ProtestModeLayout;
