import { useRouter } from 'expo-router';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useTranslations } from 'use-intl';
import { upperFirst } from 'lodash';
import { useAppGates } from '../../hooks/gates/useAppGates';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { isIOS } from '../../platform/detection';

const TabsLayout = () => {
  const { user } = useAuth();
  const { colors, isLiquidGlassAvailable } = useTheme();
  const t = useTranslations();
  const router = useRouter();

  useAppGates();

  return (
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
      <NativeTabs.Trigger name="(home)" disableAutomaticContentInsets={isIOS}>
        <NativeTabs.Trigger.Label hidden>
          {upperFirst(t('common.messages.home'))}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger
        name="auth"
        disableAutomaticContentInsets={isIOS}
        hidden={!!user}
        role="search"
        disabled
        listeners={() => ({
          tabPress: () => {
            router.push('/auth');
          },
        })}
      >
        <NativeTabs.Trigger.Label hidden>
          {upperFirst(t('common.messages.login'))}
        </NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'person', selected: 'person.fill' }} md="person" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
};

export default TabsLayout;
