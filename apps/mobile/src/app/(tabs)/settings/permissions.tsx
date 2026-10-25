import { useCallback } from 'react';
import { Linking, Platform } from 'react-native';
import { Host, Icon, Row, FieldGroup, Spacer, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { usePermissions } from '../../../providers/PermissionsProvider';
import { View } from '../../../components/ui/view';
import { Icons, type IconKey } from '../../../constants/icons';
import { PERMISSIONS } from '../../../lib/permissions/config';
import type { PermissionId, PermissionStatus } from '../../../lib/permissions/types';

const STATUS_LABEL_KEY: Record<PermissionStatus, string> = {
  granted: 'pages.settings.permissions.status_granted',
  denied: 'pages.settings.permissions.status_denied',
  undetermined: 'pages.settings.permissions.status_undetermined',
};

const PermissionRow = ({
  id,
  icon,
  labelKey,
}: {
  id: PermissionId;
  icon: IconKey;
  labelKey: string;
}) => {
  const t = useTranslations();
  const { colors, theme } = useTheme();
  const { status, request } = usePermissions()[id];

  const handlePress = useCallback(() => {
    if (status === 'denied') {
      Linking.openSettings();
      return;
    }
    if (status === 'undetermined') {
      request();
    }
  }, [status, request]);

  return (
    <Row
      spacing={theme.spaces.md}
      alignment="center"
      onPress={handlePress}
      modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
    >
      <Icon name={Icons[icon]} size={theme.icons.sizes.md} color={colors.foreground} />
      <NativeText textStyle={{ color: colors.foreground }}>{t(labelKey)}</NativeText>
      <Spacer flexible />
      <NativeText textStyle={{ color: colors.mutedForeground }}>
        {t(STATUS_LABEL_KEY[status])}
      </NativeText>
    </Row>
  );
};

const PermissionsScreen = () => {
  const { colors, mode } = useTheme();

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
            {PERMISSIONS.map((permission) => (
              <PermissionRow
                key={permission.id}
                id={permission.id}
                icon={permission.icon}
                labelKey={permission.labelKey}
              />
            ))}
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </View>
  );
};

export default PermissionsScreen;
