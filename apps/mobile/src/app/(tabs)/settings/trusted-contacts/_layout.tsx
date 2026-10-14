import { useTranslations } from 'use-intl';
import { Stack, useRouter, withLayoutContext } from 'expo-router';
import {
  createMaterialTopTabNavigator,
  MaterialTopTabBarProps,
  MaterialTopTabNavigationEventMap,
  MaterialTopTabNavigationOptions,
} from 'expo-router/js-top-tabs';
import { ParamListBase, TabNavigationState } from 'expo-router/react-navigation';
import { SegmentedControlTabBar } from '../../../../components/ui/segmented-control-tabbar';
import { View } from 'react-native';
import { Button } from '../../../../components/ui/Button';
import { Icons } from '../../../../constants/IconsOld';
import { useCallback } from 'react';
import { useTheme } from '../../../../providers/ThemeProvider';

const Tab = createMaterialTopTabNavigator();

const MaterialTopTabs = withLayoutContext<
  MaterialTopTabNavigationOptions,
  typeof Tab.Navigator,
  TabNavigationState<ParamListBase>,
  MaterialTopTabNavigationEventMap
>(Tab.Navigator);

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
      <MaterialTopTabs
        initialRouteName="index"
        tabBar={(props: MaterialTopTabBarProps) => <SegmentedControlTabBar {...props} />}
        screenOptions={{
          swipeEnabled: false,
        }}
      >
        <MaterialTopTabs.Screen name="index" options={{ title: t('messages.my_contacts') }} />
        <MaterialTopTabs.Screen name="as-contact" options={{ title: t('messages.trusts_me') }} />
      </MaterialTopTabs>
    </>
  );
};

export default TrustedContactsLayout;
