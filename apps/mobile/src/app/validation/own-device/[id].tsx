import { useCallback, useEffect } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Host, Text as NativeText } from '@expo/ui';
import { buttonStyle, controlSize, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useFormatter, useNow, useTranslations } from 'use-intl';
import {
  recoveryRequestCurrentOptions,
  trustedContactsOptions,
  useCancelRecoveryRequestMutation,
  useCreateRecoveryRequestMutation,
} from '@libs/query-client';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { useModalHeaderOptions } from '../../../hooks/useModalHeaderOptions';
import { useRecoveryOutcome } from '../../../hooks/sync/useRecoveryOutcome';
import { useTheme } from '../../../providers/ThemeProvider';
import { useToast } from '../../../components/Toast';
import { NativeButton } from '../../../components/ui/NativeButton';
import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/text';
import { View } from '../../../components/ui/view';
import { isAndroid, isIpad } from '../../../platform/detection';
import { Icons } from '../../../constants/IconsOld';
import { logger } from '../../../logger';
import tw from '../../../lib/tw';

/**
 * Pushed by `usePendingActionsGate` when *this* device is the one
 * pending - see `validation/device/[id].tsx`'s own doc comment, same
 * close-on-disappear reasoning applies here (including the Android
 * custom-header note). Also reachable manually from `settings/recovery.tsx`
 * for when this popup got closed without the status changing - that
 * screen still uses the old shared `OwnDeviceWaitingContent` component for
 * now, to be redone later; this one is self-contained.
 *
 * Two states, switched on whether a recovery request already exists:
 * - Waiting on a sibling: mostly just a spinner - the list of approver
 *   devices used to be rendered here too, but this is a formSheet that
 *   can't scroll, so with enough devices it would just overflow the
 *   sheet. Still shown in `settings/recovery.tsx` (via
 *   `OwnDevicePendingContent`) - not a formSheet, so not this screen's
 *   problem. The one real decision available here is declaring
 *   "I don't have access to any of my other devices" and falling back to
 *   a trusted-contacts recovery request (see
 *   `recovery_requests::handlers::create_recovery_request`) - disabled
 *   with an explanation if there's no accepted trusted contact to ask,
 *   since that would just wipe every sibling device for a request that
 *   could never reach quorum.
 * - Recovery in progress: nothing left to decide, just progress to watch
 *   and the option to cancel. The actual reconstruction (once the
 *   mandatory delay passes and enough contacts have approved) happens in
 *   the background - see `useRecoveryRequestCompletion`.
 *
 * Closing it (swipe, back, navigating away) has no server-side effect on
 * its own - registration stays pending either way, and
 * `useEnsureRecoveryIdentity` re-announces this device on every app
 * launch regardless.
 */
const ValidationOwnDeviceScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, colors, mode } = useTheme();
  const t = useTranslations();
  const format = useFormatter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigationHeaderHeight = useHeaderHeight();
  const bottomInset = isIpad ? insets.bottom : 0;
  const now = useNow();
  const action = usePendingAction('own_device_registration', id);
  const { data: request } = useQuery(recoveryRequestCurrentOptions());
  const { data: contacts } = useQuery(trustedContactsOptions());
  const createRecovery = useCreateRecoveryRequestMutation();
  const cancelRecovery = useCancelRecoveryRequestMutation();
  const { isImpossible } = useRecoveryOutcome(request);

  const isRecovering = request?.status === 'pending';
  const title = isRecovering
    ? t('pages.pending_actions.own_device.recovery.title')
    : t('pages.pending_actions.own_device.title');
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });

  useEffect(() => {
    if (!action) router.back();
  }, [action, router]);

  const hasAcceptedContact = !!contacts?.some((contact) => contact.status === 'accepted');

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

  const handleCancelRecovery = useCallback(() => {
    if (!request) return;
    Alert.alert(
      t('pages.pending_actions.own_device.recovery.cancel_confirm_title'),
      t('pages.pending_actions.own_device.recovery.cancel_confirm_message'),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        {
          text: t('pages.pending_actions.own_device.recovery.cancel'),
          style: 'destructive',
          onPress: () => {
            cancelRecovery.mutate(request.id, {
              onError: (error) => {
                toast.error(t('messages.an_error_occurred'));
                logger.error('cancel recovery request error', { error });
              },
            });
          },
        },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, mode, cancelRecovery, request, toast]);

  if (!action) return null;

  const releaseAt = request ? new Date(request.releaseAt) : null;
  const isReleased = !!releaseAt && now.getTime() >= releaseAt.getTime();

  return (
    <>
      <Stack.Screen
        options={isAndroid ? { headerShown: false } : { ...modalHeaderOptions, title }}
      />
      <ScrollView
        bounces={false}
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{
          paddingBottom: bottomInset + theme.spaces.vertical,
        }}
      >
        {isAndroid && (
          <View
            style={[
              tw`flex-row items-center`,
              {
                paddingTop: theme.spaces.sm,
                paddingBottom: theme.spaces.sm,
                paddingLeft: insets.left + theme.spaces.horizontal,
                paddingRight: insets.right + theme.spaces.horizontal,
              },
            ]}
          >
            <Button
              variant="muted"
              size="icon"
              icon={Icons.X}
              onPress={() => router.dismiss()}
              style={tw`rounded-full`}
            />
            <View pointerEvents="none" style={tw`items-center justify-center absolute inset-0`}>
              <Text variant="title" numberOfLines={1}>
                {title}
              </Text>
            </View>
          </View>
        )}
        <View
          style={{
            gap: theme.spaces.md,
            alignItems: isRecovering ? 'center' : undefined,
            paddingTop: navigationHeaderHeight + theme.spaces.vertical,
            paddingLeft: insets.left + theme.spaces.horizontal,
            paddingRight: insets.right + theme.spaces.horizontal,
          }}
        >
          {isRecovering && request ? (
            <>
              <Text textColor="muted" style={{ textAlign: 'center' }}>
                {isReleased
                  ? t('pages.pending_actions.own_device.recovery.waiting_shares_body')
                  : t('pages.pending_actions.own_device.recovery.delay_body', {
                      releaseAt: format.dateTime(releaseAt as Date, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }),
                    })}
              </Text>
              <Text>
                {t('pages.pending_actions.own_device.recovery.progress', {
                  approved: request.approvedContacts,
                  declined: request.declinedContacts,
                  total: request.totalContacts,
                })}
              </Text>
              {isImpossible && (
                <Text textColor="destructive" style={{ textAlign: 'center' }}>
                  {t('pages.pending_actions.own_device.recovery.impossible')}
                </Text>
              )}
              <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
                <NativeButton
                  disabled={cancelRecovery.isPending}
                  onPress={handleCancelRecovery}
                  colors={{
                    containerColor: colors.destructive,
                    contentColor: colors.destructiveForeground,
                  }}
                  iosModifiers={[
                    buttonStyle('glassProminent'),
                    controlSize('extraLarge'),
                    tint(colors.destructive),
                  ]}
                  androidModifiers={[fillMaxWidth()]}
                >
                  <NativeText
                    textStyle={{ color: colors.foreground, textAlign: 'center' }}
                    modifiers={
                      Platform.OS === 'ios' ? [frame({ maxWidth: Infinity })] : [fillMaxWidth()]
                    }
                  >
                    {t('pages.pending_actions.own_device.recovery.cancel')}
                  </NativeText>
                </NativeButton>
              </Host>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color={colors.mutedForeground} />
              <Text textColor="muted" style={{ textAlign: 'center' }}>
                {t('pages.pending_actions.own_device.body')}
              </Text>
              {hasAcceptedContact ? (
                <Host matchContents style={{ alignSelf: 'center', marginTop: theme.spaces.sm }}>
                  <NativeButton
                    label={t('pages.pending_actions.own_device.recovery.start_short')}
                    disabled={createRecovery.isPending}
                    onPress={handleStartRecovery}
                    colors={{
                      containerColor: colors.destructive,
                      contentColor: colors.destructiveForeground,
                    }}
                    iosModifiers={[
                      buttonStyle('glassProminent'),
                      controlSize('small'),
                      tint(colors.destructive),
                    ]}
                  />
                </Host>
              ) : (
                <Text textColor="muted" style={{ textAlign: 'center' }}>
                  {t('pages.pending_actions.own_device.recovery.no_contacts')}
                </Text>
              )}
            </>
          )}
        </View>
      </ScrollView>
    </>
  );
};

export default ValidationOwnDeviceScreen;
