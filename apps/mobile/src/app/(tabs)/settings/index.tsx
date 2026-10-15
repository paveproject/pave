import { useCallback, useMemo, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import * as Application from 'expo-application';
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
import { useTheme } from '../../../providers/ThemeProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { useUIStore } from '../../../stores/useUIStore';
import { View } from '../../../components/ui/view';
import { Avatar } from '../../../components/ui/Avatar';
import { NativeButton } from '../../../components/ui/NativeButton';
import { Icons } from '../../../constants/icons';
import app from '../../../constants/app';

const DEBUG_TAP_WINDOW_MS = 600;
const DEBUG_TAP_COUNT = 3;

const SettingsScreen = () => {
  const router = useRouter();
  const t = useTranslations();
  const { user, logout } = useAuth();
  const { colors, theme, mode } = useTheme();
  const debug = useUIStore((state) => state.debug);
  const toggleDebug = useUIStore((state) => state.toggleDebug);

  const appVersion = useMemo(() => Application.nativeApplicationVersion, []);

  const versionTapCountRef = useRef(0);
  const versionTapTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleVersionTap = useCallback(() => {
    clearTimeout(versionTapTimerRef.current);
    versionTapCountRef.current += 1;

    if (versionTapCountRef.current >= DEBUG_TAP_COUNT) {
      versionTapCountRef.current = 0;
      const willEnable = !debug;
      toggleDebug();
      Alert.alert(
        t(willEnable ? 'messages.debug_mode_enabled' : 'messages.debug_mode_disabled'),
        undefined,
        undefined,
        { userInterfaceStyle: mode },
      );
      return;
    }

    versionTapTimerRef.current = setTimeout(() => {
      versionTapCountRef.current = 0;
    }, DEBUG_TAP_WINDOW_MS);
  }, [debug, toggleDebug, t, mode]);

  const handleSignIn = useCallback(() => {
    router.push('/auth');
  }, [router]);

  const handleAppearance = useCallback(() => {
    router.push('/settings/appearance');
  }, [router]);

  const handleAccount = useCallback(() => {
    router.push('/settings/account');
  }, [router]);

  const handleTrustedContacts = useCallback(() => {
    router.push('/settings/trusted-contacts');
  }, [router]);

  const handleDevices = useCallback(() => {
    router.push('/settings/devices');
  }, [router]);

  const handleDebug = useCallback(() => {
    router.push('/settings/debug');
  }, [router]);

  const handleSignOut = useCallback(() => {
    Alert.alert(
      t('messages.are_u_sure'),
      undefined,
      [
        { text: t('messages.cancel'), style: 'cancel' },
        { text: t('messages.sign_out'), style: 'destructive', onPress: logout },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, logout, mode]);

  const signInIosModifiers = [
    buttonStyle('glassProminent'),
    controlSize('extraLarge'),
    tint(colors.secondary),
    listRowBackground(colors.muted),
  ];

  const signInLabelModifiers =
    Platform.OS === 'ios' ? [frame({ maxWidth: Infinity })] : [fillMaxWidth()];

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Host
        style={{ flex: 1, width: '100%' }}
        seedColor={colors.foreground}
        // Without this, Compose derives light/dark from the device setting
        // (`isSystemInDarkTheme()`), so a theme forced in-app renders the
        // Material palette of the opposite scheme.
        colorScheme={mode}
      >
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
            {!user ? (
              <NativeButton
                onPress={handleSignIn}
                style={{ paddingVertical: theme.spaces.sm }}
                colors={{
                  containerColor: colors.secondary,
                  contentColor: colors.secondaryForeground,
                }}
                iosModifiers={signInIosModifiers}
                androidModifiers={[fillMaxWidth()]}
                androidContentPadding={{ top: theme.spaces.sm, bottom: theme.spaces.sm }}
              >
                <NativeText
                  textStyle={{ color: colors.secondaryForeground, textAlign: 'center' }}
                  modifiers={signInLabelModifiers}
                >
                  {t('messages.sign_in')}
                </NativeText>
              </NativeButton>
            ) : (
              <>
                <Row
                  spacing={theme.spaces.md}
                  alignment="center"
                  modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
                >
                  <Avatar uri={user.image} size={theme.spaces['4xl']} />
                  <NativeText textStyle={{ color: colors.foreground }}>
                    {user.username ? `@${user.username}` : user.name || user.email || ''}
                  </NativeText>
                </Row>
                <Row
                  spacing={theme.spaces.md}
                  alignment="center"
                  onPress={handleAccount}
                  modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
                >
                  <Icon name={Icons.user} size={theme.icons.sizes.md} color={colors.foreground} />
                  <NativeText textStyle={{ color: colors.foreground }}>
                    {t('messages.account')}
                  </NativeText>
                  <Spacer flexible />
                  <Icon
                    name={Icons.chevronRight}
                    size={theme.icons.sizes.sm}
                    color={colors.mutedForeground}
                  />
                </Row>
                <Row
                  spacing={theme.spaces.md}
                  alignment="center"
                  onPress={handleTrustedContacts}
                  modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
                >
                  <Icon name={Icons.user} size={theme.icons.sizes.md} color={colors.foreground} />
                  <NativeText textStyle={{ color: colors.foreground }}>
                    {t('messages.trusted_contacts')}
                  </NativeText>
                  <Spacer flexible />
                  <Icon
                    name={Icons.chevronRight}
                    size={theme.icons.sizes.sm}
                    color={colors.mutedForeground}
                  />
                </Row>
                <Row
                  spacing={theme.spaces.md}
                  alignment="center"
                  onPress={handleDevices}
                  modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
                >
                  <Icon name={Icons.device} size={theme.icons.sizes.md} color={colors.foreground} />
                  <NativeText textStyle={{ color: colors.foreground }}>
                    {t('messages.devices')}
                  </NativeText>
                  <Spacer flexible />
                  <Icon
                    name={Icons.chevronRight}
                    size={theme.icons.sizes.sm}
                    color={colors.mutedForeground}
                  />
                </Row>
                <Row
                  spacing={theme.spaces.md}
                  alignment="center"
                  onPress={handleSignOut}
                  modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
                >
                  <Icon
                    name={Icons.signOut}
                    size={theme.icons.sizes.md}
                    color={colors.destructive}
                  />
                  <NativeText textStyle={{ color: colors.destructive }}>
                    {t('messages.sign_out')}
                  </NativeText>
                </Row>
              </>
            )}
          </FieldGroup.Section>

          <FieldGroup.Section>
            <Row
              spacing={theme.spaces.md}
              alignment="center"
              onPress={handleAppearance}
              modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
            >
              <Icon name={Icons.appearance} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('messages.appearance')}
              </NativeText>
              <Spacer flexible />
              <Icon
                name={Icons.chevronRight}
                size={theme.icons.sizes.sm}
                color={colors.mutedForeground}
              />
            </Row>
            {debug && (
              <Row
                spacing={theme.spaces.md}
                alignment="center"
                onPress={handleDebug}
                modifiers={Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined}
              >
                <Icon name={Icons.settings} size={theme.icons.sizes.md} color={colors.foreground} />
                <NativeText textStyle={{ color: colors.foreground }}>Debug</NativeText>
                <Spacer flexible />
                <Icon
                  name={Icons.chevronRight}
                  size={theme.icons.sizes.sm}
                  color={colors.mutedForeground}
                />
              </Row>
            )}

            <FieldGroup.SectionFooter>
              <NativeText
                onPress={handleVersionTap}
                textStyle={{ color: colors.mutedForeground, textAlign: 'center' }}
                modifiers={
                  Platform.OS === 'ios' ? [frame({ maxWidth: Infinity })] : [fillMaxWidth()]
                }
              >
                {`${app.name} • v${appVersion || 'N/A'}`}
              </NativeText>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>
        </FieldGroup>
      </Host>
    </View>
  );
};

export default SettingsScreen;
