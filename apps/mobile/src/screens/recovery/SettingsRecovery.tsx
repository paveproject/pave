import { useCallback } from 'react';
import { ActivityIndicator, Alert, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Host, Icon, Row, FieldGroup, Text as NativeText } from '@expo/ui';
import {
  background,
  listRowBackground,
  refreshable,
  scrollContentBackground,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { PullToRefreshBox } from '@expo/ui/jetpack-compose';
import { useTranslations } from 'use-intl';
import {
  devicesOptions,
  pendingActionsOptions,
  recoveryRequestCurrentOptions,
  trustedContactsOptions,
  useCreateRecoveryRequestMutation,
  useSetDeviceMutation,
} from '@libs/query-client';
import type { MePendingAction } from '@libs/api-js';
import { RecoveryProgressSection } from './components/RecoveryProgressSection';
import { getIdentityPublicKeyHex } from '../../lib/recoveryKey';
import { useDeviceId } from '../../hooks/useDeviceId';
import { View } from '../../components/ui/view';
import Empty from '../../components/ui/empty';
import { useTheme } from '../../providers/ThemeProvider';
import { useAuth } from '../../providers/AuthProvider';
import { useToast } from '../../components/Toast';
import { logger } from '../../logger';
import { Icons } from '../../constants/icons';

/**
 * Manual fallback for `validation/own-device/[id].tsx` - same underlying
 * state, reachable from settings for when that formSheet got closed
 * without the status actually changing. The "Resend request"/"Register
 * again" row just re-sends `PUT /me/devices` (same call
 * `useEnsureRecoveryIdentity` already makes on every launch) - if
 * `usePendingActionsGate` is working correctly, that alone is enough to
 * pop the formSheet open again on its own (see that hook's own doc
 * comment on why it folds `updatedAt` into its dedup key specifically for
 * this), so this screen never has to navigate anywhere itself.
 *
 * Four real states: `ownPending` + no request (still waiting on a
 * sibling), `ownPending` + a pending request (recovery in progress, see
 * `RecoveryProgressSection`), `thisDevice?.status === 'active'` (genuinely
 * approved), or neither - which means this device's row is simply gone
 * (declined, or revoked) - never falls back to claiming "active" just
 * because it isn't pending anymore.
 */
const SettingsRecovery = () => {
  const t = useTranslations();
  const { theme, colors, mode } = useTheme();
  const { user } = useAuth();
  const toast = useToast();
  const deviceId = useDeviceId();

  const pendingActionsQuery = useQuery(pendingActionsOptions());
  const devicesQuery = useQuery(devicesOptions());
  const recoveryRequestQuery = useQuery(recoveryRequestCurrentOptions());
  const contactsQuery = useQuery(trustedContactsOptions());

  const setDevice = useSetDeviceMutation();
  const createRecovery = useCreateRecoveryRequestMutation();

  const pendingActions = pendingActionsQuery.data;
  const devices = devicesQuery.data;
  const recoveryRequest = recoveryRequestQuery.data;
  const contacts = contactsQuery.data;

  const ownPending = pendingActions?.find(
    (action): action is Extract<MePendingAction, { kind: 'own_device_registration' }> =>
      action.kind === 'own_device_registration' && action.id === deviceId,
  );
  const thisDevice = devices?.find((device) => device.id === deviceId);
  const isActive = thisDevice?.status === 'active';
  const isRecovering = recoveryRequest?.status === 'pending';
  const hasAcceptedContact = !!contacts?.some((contact) => contact.status === 'accepted');

  // `undefined` while a query's first fetch is still in flight - distinct
  // from "declined", which is a `devices` array that *has* loaded but no
  // longer contains this id at all.
  const isLoaded =
    pendingActions !== undefined && devices !== undefined && recoveryRequest !== undefined;
  const hasError =
    pendingActionsQuery.isError ||
    devicesQuery.isError ||
    recoveryRequestQuery.isError ||
    contactsQuery.isError;

  const refreshing =
    pendingActionsQuery.isRefetching ||
    devicesQuery.isRefetching ||
    recoveryRequestQuery.isRefetching ||
    contactsQuery.isRefetching;
  const onRefresh = useCallback(async () => {
    await Promise.all([
      pendingActionsQuery.refetch(),
      devicesQuery.refetch(),
      recoveryRequestQuery.refetch(),
      contactsQuery.refetch(),
    ]);
  }, [pendingActionsQuery, devicesQuery, recoveryRequestQuery, contactsQuery]);

  const handleRegisterAgain = useCallback(async () => {
    if (!user) return;
    try {
      const publicKey = await getIdentityPublicKeyHex(user.id);
      if (!publicKey) return;
      await setDevice.mutateAsync({
        publicKey,
        deviceType: ownPending?.deviceType ?? thisDevice?.deviceType ?? 'ios',
      });
      toast.success(t('pages.settings.recovery.resend_success'));
    } catch (error) {
      toast.error(t('messages.an_error_occurred'));
      logger.error('resend device approval request error', { error });
    }
  }, [user, ownPending, thisDevice, setDevice, toast, t]);

  const handleStartRecovery = useCallback(() => {
    Alert.alert(
      t('pages.pending_actions.own_device.recovery.start_confirm_title'),
      t('pages.pending_actions.own_device.recovery.start_confirm_message'),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        {
          text: t('pages.pending_actions.own_device.recovery.start'),
          style: 'destructive',
          onPress: () => {
            createRecovery.mutate(undefined, {
              onError: (error) => {
                toast.error(t('messages.an_error_occurred'));
                logger.error('create recovery request error', { error });
              },
            });
          },
        },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, mode, createRecovery, toast]);

  const rowBackground = Platform.OS === 'ios' ? [listRowBackground(colors.muted)] : undefined;

  if (hasError) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Empty icon={Icons.error} title={t('messages.an_error_occurred')} />
      </View>
    );
  }

  if (!isLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  const fieldGroup = (
    <FieldGroup
      style={{ backgroundColor: colors.background }}
      modifiers={
        Platform.OS === 'ios'
          ? [
              scrollContentBackground('hidden'),
              background(colors.background),
              tint(colors.foreground),
              refreshable(onRefresh),
            ]
          : undefined
      }
    >
      {ownPending ? (
        isRecovering && recoveryRequest ? (
          <RecoveryProgressSection request={recoveryRequest} />
        ) : (
          <>
            <FieldGroup.Section>
              <Row spacing={theme.spaces.md} alignment="center" modifiers={rowBackground}>
                <Icon name={Icons.clock} size={theme.icons.sizes.md} color={colors.foreground} />
                <NativeText textStyle={{ color: colors.foreground }}>
                  {t('pages.pending_actions.own_device.title')}
                </NativeText>
              </Row>
              <FieldGroup.SectionFooter>
                <NativeText textStyle={{ color: colors.mutedForeground, textAlign: 'center' }}>
                  {t('pages.pending_actions.own_device.body')}
                </NativeText>
              </FieldGroup.SectionFooter>
            </FieldGroup.Section>

            <FieldGroup.Section>
              <Row
                spacing={theme.spaces.md}
                alignment="center"
                onPress={setDevice.isPending ? undefined : handleRegisterAgain}
                modifiers={rowBackground}
              >
                <Icon name={Icons.refresh} size={theme.icons.sizes.md} color={colors.foreground} />
                <NativeText textStyle={{ color: colors.foreground }}>
                  {t('pages.settings.recovery.resend')}
                </NativeText>
              </Row>
            </FieldGroup.Section>

            <FieldGroup.Section>
              {hasAcceptedContact ? (
                <Row
                  spacing={theme.spaces.md}
                  alignment="center"
                  onPress={createRecovery.isPending ? undefined : handleStartRecovery}
                  modifiers={rowBackground}
                >
                  <Icon
                    name={Icons.warning}
                    size={theme.icons.sizes.md}
                    color={colors.destructive}
                  />
                  <NativeText textStyle={{ color: colors.destructive }}>
                    {t('pages.pending_actions.own_device.recovery.start_short')}
                  </NativeText>
                </Row>
              ) : (
                <FieldGroup.SectionFooter>
                  <NativeText textStyle={{ color: colors.mutedForeground, textAlign: 'center' }}>
                    {t('pages.pending_actions.own_device.recovery.no_contacts')}
                  </NativeText>
                </FieldGroup.SectionFooter>
              )}
            </FieldGroup.Section>
          </>
        )
      ) : isActive ? (
        <FieldGroup.Section>
          <Row spacing={theme.spaces.md} alignment="center" modifiers={rowBackground}>
            <Icon name={Icons.check} size={theme.icons.sizes.md} color={colors.success} />
            <NativeText textStyle={{ color: colors.foreground }}>
              {t('pages.settings.recovery.active_title')}
            </NativeText>
          </Row>
          <FieldGroup.SectionFooter>
            <NativeText textStyle={{ color: colors.mutedForeground, textAlign: 'center' }}>
              {t('pages.settings.recovery.active_body')}
            </NativeText>
          </FieldGroup.SectionFooter>
        </FieldGroup.Section>
      ) : (
        <>
          <FieldGroup.Section>
            <Row spacing={theme.spaces.md} alignment="center" modifiers={rowBackground}>
              <Icon name={Icons.warning} size={theme.icons.sizes.md} color={colors.destructive} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.settings.recovery.declined_title')}
              </NativeText>
            </Row>
            <FieldGroup.SectionFooter>
              <NativeText textStyle={{ color: colors.mutedForeground, textAlign: 'center' }}>
                {t('pages.settings.recovery.declined_body')}
              </NativeText>
            </FieldGroup.SectionFooter>
          </FieldGroup.Section>

          <FieldGroup.Section>
            <Row
              spacing={theme.spaces.md}
              alignment="center"
              onPress={setDevice.isPending ? undefined : handleRegisterAgain}
              modifiers={rowBackground}
            >
              <Icon name={Icons.refresh} size={theme.icons.sizes.md} color={colors.foreground} />
              <NativeText textStyle={{ color: colors.foreground }}>
                {t('pages.settings.recovery.register_again')}
              </NativeText>
            </Row>
          </FieldGroup.Section>
        </>
      )}
    </FieldGroup>
  );

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
        {Platform.OS === 'android' ? (
          <PullToRefreshBox isRefreshing={refreshing} onRefresh={onRefresh}>
            {fieldGroup}
          </PullToRefreshBox>
        ) : (
          fieldGroup
        )}
      </Host>
    </View>
  );
};

export default SettingsRecovery;
