import { useCallback } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Host, Icon, Row, FieldGroup, Spacer, Switch, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { usePermissions } from '../../../providers/PermissionsProvider';
import { useMeshSettingsStore } from '../../../stores/useMeshSettingsStore';
import { View } from '../../../components/ui/view';
import { Icons } from '../../../constants/icons';

const MeshRelayScreen = () => {
  const t = useTranslations();
  const router = useRouter();
  const { colors, theme, mode } = useTheme();
  const bluetooth = usePermissions().bluetooth;
  const meshRelayEnabled = useMeshSettingsStore((state) => state.meshRelayEnabled);
  const setMeshRelayEnabled = useMeshSettingsStore((state) => state.setMeshRelayEnabled);

  const handleToggle = useCallback(
    async (value: boolean) => {
      // Enabling is the one action that should drive the OS permission
      // prompt - disabling never needs to ask for anything.
      if (value) {
        const granted = bluetooth.status === 'granted' ? true : await bluetooth.request();
        if (!granted) {
          Alert.alert(
            t('pages.settings.mesh_relay.permission_denied_title'),
            t('pages.settings.mesh_relay.permission_denied_message'),
            [
              { text: t('messages.cancel'), style: 'cancel' },
              { text: t('messages.open_settings'), onPress: () => Linking.openSettings() },
            ],
            { userInterfaceStyle: mode },
          );
          return;
        }
      }
      setMeshRelayEnabled(value);
    },
    [bluetooth, t, mode, setMeshRelayEnabled],
  );

  const handleManagePermissions = useCallback(() => {
    router.push('/settings/permissions');
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Host style={{ flex: 1, width: '100%' }} seedColor={colors.foreground} colorScheme={mode}>
        <FieldGroup
          style={{ backgroundColor: colors.background }}
          modifiers={
            Platform.OS === 'ios'
              ? [
                  scrollContentBackground('hidden'),
                  background(colors.background),
                  tint(colors.foreground),
                ]
              : undefined
          }
        >
          <FieldGroup.Section>
            <Row
              spacing={theme.spaces.md}
              alignment="center"
              modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
            >
              <Icon name={Icons.bluetooth} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.settings.mesh_relay.toggle_label')}
              </NativeText>
              <Spacer flexible />
              <Switch value={meshRelayEnabled} onValueChange={handleToggle} />
            </Row>
            <FieldGroup.SectionFooter>
              <NativeText textStyle={{ color: colors.mutedForeground }}>
                {t('pages.settings.mesh_relay.footer_description')}
              </NativeText>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          {bluetooth.status === 'denied' && (
            <FieldGroup.Section>
              <Row
                spacing={theme.spaces.md}
                alignment="center"
                onPress={handleManagePermissions}
                modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
              >
                <NativeText textStyle={{ color: colors.mutedForeground }}>
                  {t('pages.settings.mesh_relay.permission_hint')}
                </NativeText>
                <Spacer flexible />
                <Icon
                  name={Icons.chevronRight}
                  size={theme.icons.sizes.sm}
                  color={colors.mutedForeground}
                />
              </Row>
            </FieldGroup.Section>
          )}
        </FieldGroup>
      </Host>
    </View>
  );
};

export default MeshRelayScreen;
