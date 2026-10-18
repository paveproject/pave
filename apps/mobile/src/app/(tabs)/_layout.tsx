import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslations } from 'use-intl';
import { useAppGates } from '../../hooks/gates/useAppGates';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { isIOS } from '../../platform/detection';
import { useRouter } from 'expo-router';
import { ProtestModeAccessoryContent } from '../../components/ProtestMode/ProtestModeAccessoryContent';
import { ProtestModeFloatingBar } from '../../components/ProtestMode/ProtestModeFloatingBar';

const TabsLayout = () => {
  const { user } = useAuth();
  const router = useRouter();
  const { colors, isLiquidGlassAvailable } = useTheme();
  const t = useTranslations();

  useAppGates();

  // Apple Music mini-player style: always visible, opens the full
  // `/protest-mode` screen on tap. `NativeTabs.BottomAccessory` is the real
  // native mechanism for this (`UITabBarController.bottomAccessory`), but
  // it's iOS 26+ only - `isLiquidGlassAvailable` is this app's existing
  // check for that same OS era (see `ThemeProvider`). Everywhere else falls
  // back to `ProtestModeFloatingBar`, a plain absolutely-positioned bar
  // with the same content.
  const showProtestModeAccessory = !!user;

  return (
    <>
      <NativeTabs
        iconColor={{
          default: colors.foreground,
          selected: isIOS ? colors.primary : colors.foreground,
        }}
        labelStyle={{
          default: {
            color: colors.foreground,
          },
          selected: {
            color: isLiquidGlassAvailable ? colors.primary : colors.foreground,
          },
        }}
        rippleColor={colors.primary}
        backgroundColor={colors.muted}
        indicatorColor={colors.mutedForeground}
        disableTransparentOnScrollEdge
      >
        {showProtestModeAccessory && isLiquidGlassAvailable && (
          <NativeTabs.BottomAccessory>
            <ProtestModeAccessoryContent />
          </NativeTabs.BottomAccessory>
        )}
        <NativeTabs.Trigger name="(home)" disableAutomaticContentInsets={isIOS}>
          <NativeTabs.Trigger.Label hidden>{t('messages.home')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger
          name="map"
          disableAutomaticContentInsets={isIOS}
          disabled
          listeners={() => ({
            tabPress: () => {
              router.push('/map');
            },
          })}
        >
          <NativeTabs.Trigger.Label hidden>{t('messages.map')}</NativeTabs.Trigger.Label>
          <NativeTabs.Trigger.Icon sf={{ default: 'map', selected: 'map.fill' }} md="map" />
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="settings" disableAutomaticContentInsets={isIOS}>
          <NativeTabs.Trigger.Label hidden>{t('messages.settings')}</NativeTabs.Trigger.Label>
          {user?.image ? (
            <NativeTabs.Trigger.Icon src={{ uri: user.image }} />
          ) : (
            <NativeTabs.Trigger.Icon
              sf={{ default: 'person', selected: 'person.fill' }}
              md="person"
            />
          )}
        </NativeTabs.Trigger>
      </NativeTabs>
      {showProtestModeAccessory && !isLiquidGlassAvailable && <ProtestModeFloatingBar />}
    </>
  );
};

export default TabsLayout;
