import { useTranslations } from 'use-intl';
import { Stack, useRouter } from 'expo-router';
import { TopTabs, MaterialTopTabBarProps } from 'expo-router/js-top-tabs';
import { SegmentedControlTabBar } from '../../../../components/ui/segmented-control-tabbar';
import { View } from 'react-native';
import { Button } from '../../../../components/ui/Button';
import { Icons } from '../../../../constants/IconsOld';
import { useCallback } from 'react';
import { useTheme } from '../../../../providers/ThemeProvider';

const TrustedContactsLayout = () => {
  const t = useTranslations();
  const router = useRouter();
  const { theme } = useTheme();

  const goToAdd = useCallback(() => {
    router.push({
      pathname: '/(tabs)/settings/trusted-contact/add',
    });
  }, [router]);

  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spaces.sm }}>
              <Button variant="ghost" size="icon" icon={Icons.Add} onPress={goToAdd} />
            </View>
          ),
          unstable_headerRightItems: () => [
            {
              type: 'button' as const,
              label: t('messages.add'),
              onPress: goToAdd,
              icon: { name: 'plus', type: 'sfSymbol' as const },
            },
          ],
        }}
      />
      <TopTabs
        tabBar={(props: MaterialTopTabBarProps) => <SegmentedControlTabBar {...props} />}
        screenOptions={{
          swipeEnabled: false,
        }}
      >
        <TopTabs.Screen name="index" options={{ title: t('messages.my_contacts') }} />
        <TopTabs.Screen name="as-contact" options={{ title: t('messages.trusts_me') }} />
      </TopTabs>
    </>
  );
};

export default TrustedContactsLayout;
