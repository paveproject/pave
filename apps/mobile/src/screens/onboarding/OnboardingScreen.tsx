import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, Icon, Row, FieldGroup, Spacer, Text as NativeText } from '@expo/ui';
import {
  background,
  buttonStyle,
  controlSize,
  frame,
  listRowBackground,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { usePermissions } from '../../providers/PermissionsProvider';
import { useUIStore } from '../../stores/useUIStore';
import { useMeshSettingsStore } from '../../stores/useMeshSettingsStore';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { Switch } from '../../components/ui/switch';
import { NativeButton } from '../../components/ui/NativeButton';
import { Icons } from '../../constants/icons';
import { PERMISSIONS, type PermissionConfigEntry } from '../../lib/permissions/config';

const PermissionRow = ({ icon, labelKey, reasonKey, id }: PermissionConfigEntry) => {
  const t = useTranslations();
  const { colors, theme } = useTheme();
  const permissions = usePermissions();
  const setMeshRelayEnabled = useMeshSettingsStore((state) => state.setMeshRelayEnabled);
  const { status, request } = permissions[id];

  const handleToggle = useCallback(
    async (value: boolean) => {
      // A granted OS permission can't be revoked from in-app - nothing to
      // request when the switch is being turned off.
      if (!value) return;
      const granted = await request();
      if (id === 'bluetooth' && granted) {
        setMeshRelayEnabled(true);
      }
    },
    [request, id, setMeshRelayEnabled],
  );

  return (
    <>
      <Row
        spacing={theme.spaces.md}
        alignment="center"
        modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
      >
        <Icon name={Icons[icon]} size={theme.icons.sizes.md} color={colors.foreground} />
        <NativeText textStyle={{ color: colors.foreground }}>{t(labelKey)}</NativeText>
        <Spacer flexible />
        <Switch
          value={status === 'granted'}
          disabled={status === 'granted'}
          onValueChange={handleToggle}
        />
      </Row>
      <Row
        spacing={theme.spaces.md}
        alignment="center"
        modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
      >
        <NativeText textStyle={{ color: colors.mutedForeground, fontSize: theme.fonts.sizes.sm }}>
          {t(reasonKey)}
        </NativeText>
      </Row>
      {status === 'denied' && (
        <Row
          spacing={theme.spaces.md}
          alignment="center"
          modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
        >
          <NativeText textStyle={{ color: colors.mutedForeground, fontSize: theme.fonts.sizes.sm }}>
            {t('pages.onboarding.permission_denied_hint')}
          </NativeText>
        </Row>
      )}
    </>
  );
};

const OnboardingScreen = () => {
  const t = useTranslations();
  const { colors, theme, mode } = useTheme();
  const insets = useSafeAreaInsets();
  const permissions = usePermissions();
  const setHasOnboarded = useUIStore((state) => state.setHasOnboarded);

  const handleContinue = useCallback(() => {
    const missing = PERMISSIONS.filter(
      (permission) => permissions[permission.id].status !== 'granted',
    );

    if (missing.length === 0) {
      setHasOnboarded(true);
      return;
    }

    const message = [
      t('pages.onboarding.continue_confirm_intro'),
      '',
      ...missing.map((permission) => `• ${t(permission.consequenceKey)}`),
    ].join('\n');

    Alert.alert(
      t('pages.onboarding.continue_confirm_title'),
      message,
      [
        { text: t('messages.back'), style: 'cancel' },
        { text: t('pages.onboarding.continue_anyway'), onPress: () => setHasOnboarded(true) },
      ],
      { userInterfaceStyle: mode },
    );
  }, [permissions, setHasOnboarded, t, mode]);

  const continueIosModifiers = [
    buttonStyle('glassProminent'),
    controlSize('extraLarge'),
    tint(colors.secondary),
    listRowBackground(colors.muted),
  ];

  const continueLabelModifiers =
    Platform.OS === 'ios' ? [frame({ maxWidth: Infinity })] : [fillMaxWidth()];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={{
          paddingHorizontal: theme.spaces.lg,
          paddingTop: insets.top + theme.spaces.xl,
          paddingBottom: theme.spaces.md,
        }}
      >
        <Text variant="title" textColor="foreground">
          {t('pages.onboarding.title')}
        </Text>
        <Text textColor="muted" style={{ marginTop: theme.spaces.xs }}>
          {t('pages.onboarding.description')}
        </Text>
      </View>

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
              <PermissionRow key={permission.id} {...permission} />
            ))}
          </FieldGroup.Section>

          <FieldGroup.Section>
            <NativeButton
              onPress={handleContinue}
              style={{ paddingVertical: theme.spaces.sm }}
              colors={{
                containerColor: colors.secondary,
                contentColor: colors.secondaryForeground,
              }}
              iosModifiers={continueIosModifiers}
              androidModifiers={[fillMaxWidth()]}
              androidContentPadding={{ top: theme.spaces.sm, bottom: theme.spaces.sm }}
            >
              <NativeText
                textStyle={{ color: colors.secondaryForeground, textAlign: 'center' }}
                modifiers={continueLabelModifiers}
              >
                {t('messages.continue')}
              </NativeText>
            </NativeButton>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </View>
  );
};

export default OnboardingScreen;
