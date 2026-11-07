import { useCallback, useEffect } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, Text as NativeText } from '@expo/ui';
import { buttonStyle, controlSize, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useTranslations } from 'use-intl';
import {
  useDataAccessRequestApproveMutation,
  useDataAccessRequestDeclineMutation,
} from '@libs/query-client';
import { sealShareForRecoveryRequest } from '../../../../lib/recoveryKey';
import { usePendingAction } from '../../../../hooks/usePendingAction';
import { useModalHeaderOptions } from '../../../../hooks/useModalHeaderOptions';
import { useTheme } from '../../../../providers/ThemeProvider';
import { useAuth } from '../../../../providers/AuthProvider';
import { useToast } from '../../../../components/Toast';
import { NativeButton } from '../../../../components/ui/NativeButton';
import { Button } from '../../../../components/ui/Button';
import { Avatar } from '../../../../components/ui/Avatar';
import { Text } from '../../../../components/ui/text';
import { View } from '../../../../components/ui/view';
import { isAndroid, isIpad } from '../../../../platform/detection';
import { Icons } from '../../../../constants/IconsOld';
import { logger } from '../../../../logger';
import tw from '../../../../lib/tw';

/**
 * Pushed by `usePendingActionsGate` for the `data_access_request_contact`
 * kind - the caller's role here is *contact*, hence the folder; the owner's
 * own side of the same request is `../as-owner/[id].tsx`.
 *
 * Same shape as `validation/recovery-request/[id].tsx`, with one difference
 * that drives the whole screen: approving here hands access to a **third
 * party's** data, not to the owner's own new device. So both names are on
 * screen, and the confirmation says whose recordings are at stake.
 *
 * Approving re-seals this device's held share to the requester's device, which
 * is why it reuses `sealShareForRecoveryRequest` verbatim - that function only
 * ever cared about which owner's share to take and which key to seal it to.
 */
const ValidationDataAccessRequestScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, colors, mode, isLiquidGlassAvailable } = useTheme();
  const t = useTranslations();
  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigationHeaderHeight = useHeaderHeight();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });
  const bottomInset = isIpad ? insets.bottom : 0;
  const action = usePendingAction('data_access_request_contact', id);
  const approve = useDataAccessRequestApproveMutation();
  const decline = useDataAccessRequestDeclineMutation();
  const isBusy = approve.isPending || decline.isPending;

  useEffect(() => {
    if (!action) router.back();
  }, [action, router]);

  const ownerName = action?.owner.username ?? t('messages.someone');
  const requesterName = action?.requester.username ?? t('messages.someone');

  const handleApprove = useCallback(() => {
    if (!action || !user) return;
    Alert.alert(
      t('pages.pending_actions.data_access_request.approve_confirm_title'),
      t('pages.pending_actions.data_access_request.approve_confirm_message', {
        ownerName,
        requesterName,
      }),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        {
          text: t('messages.approve'),
          style: 'destructive',
          onPress: async () => {
            const encryptedShare = await sealShareForRecoveryRequest(
              user.id,
              action.owner.id,
              action.requestingDevicePublicKey,
            );
            if (!encryptedShare) {
              // This device never held a share for that owner, so there is
              // nothing to approve *with* - decline rather than hang on an
              // approval that can never contribute to the quorum.
              decline.mutate(action.dataAccessRequestId);
              return;
            }
            approve.mutate(
              { dataAccessRequestId: action.dataAccessRequestId, encryptedShare },
              {
                onError: (error) => {
                  toast.error(t('messages.an_error_occurred'));
                  logger.error('approve data access request error', { error });
                },
              },
            );
          },
        },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, mode, ownerName, requesterName, action, approve, decline, toast, user]);

  const handleDecline = useCallback(() => {
    if (!action) return;
    decline.mutate(action.dataAccessRequestId, {
      onError: (error) => {
        toast.error(t('messages.an_error_occurred'));
        logger.error('decline data access request error', { error });
      },
    });
  }, [decline, action, toast, t]);

  if (!action) return null;

  return (
    <>
      <Stack.Screen options={isAndroid ? { headerShown: false } : modalHeaderOptions} />
      <ScrollView
        bounces={false}
        style={{ backgroundColor: colors.background }}
        contentContainerStyle={{ paddingBottom: bottomInset + theme.spaces.vertical }}
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
              disabled={isBusy}
              onPress={() => router.dismiss()}
              style={tw`rounded-full`}
            />
            <View pointerEvents="none" style={tw`items-center justify-center absolute inset-0`}>
              <Text variant="title" numberOfLines={1}>
                {t('pages.pending_actions.data_access_request.title')}
              </Text>
            </View>
          </View>
        )}
        <View
          style={{
            gap: theme.spaces.md,
            paddingTop: navigationHeaderHeight + theme.spaces.vertical,
            paddingLeft: insets.left + theme.spaces.horizontal,
            paddingRight: insets.right + theme.spaces.horizontal,
          }}
        >
          {/* Both parties, in the order the sentence reads: who is asking,
              and whose recordings they would get. */}
          {(
            [
              {
                label: t('pages.pending_actions.data_access_request.requester'),
                person: action.requester,
              },
              { label: t('pages.pending_actions.data_access_request.owner'), person: action.owner },
            ] as const
          ).map(({ label, person }) => (
            <View key={label} style={{ gap: theme.spaces.xs }}>
              <Text textColor="muted" style={{ fontSize: theme.fonts.sizes.xs }}>
                {label}
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: theme.spaces.md,
                  padding: theme.spaces.md,
                  backgroundColor: colors.muted,
                  borderRadius: theme.border.radius.md,
                }}
              >
                <Avatar uri={person.image} size={theme.spaces['3xl']} />
                <Text style={{ fontWeight: '600' }}>
                  {person.username || t('messages.someone')}
                </Text>
              </View>
            </View>
          ))}
          <Text textColor="muted">
            {t('pages.pending_actions.data_access_request.body', { ownerName, requesterName })}
          </Text>
          <View style={{ gap: theme.spaces.sm }}>
            <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
              <NativeButton
                disabled={isBusy}
                onPress={handleApprove}
                colors={{
                  containerColor: colors.destructive,
                  contentColor: colors.destructiveForeground,
                }}
                iosModifiers={[
                  buttonStyle(isLiquidGlassAvailable ? 'glassProminent' : 'borderedProminent'),
                  controlSize('extraLarge'),
                  tint(colors.destructive),
                ]}
                androidModifiers={[fillMaxWidth()]}
              >
                <NativeText
                  textStyle={{ color: colors.destructiveForeground, textAlign: 'center' }}
                  modifiers={
                    Platform.OS === 'ios' ? [frame({ maxWidth: Infinity })] : [fillMaxWidth()]
                  }
                >
                  {t('messages.approve')}
                </NativeText>
              </NativeButton>
            </Host>
            <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
              <NativeButton
                disabled={isBusy}
                onPress={handleDecline}
                colors={{ containerColor: colors.muted, contentColor: colors.foreground }}
                iosModifiers={[
                  buttonStyle(isLiquidGlassAvailable ? 'glassProminent' : 'borderedProminent'),
                  controlSize('extraLarge'),
                  tint(colors.muted),
                ]}
                androidModifiers={[fillMaxWidth()]}
              >
                <NativeText
                  textStyle={{ color: colors.foreground, textAlign: 'center' }}
                  modifiers={
                    Platform.OS === 'ios' ? [frame({ maxWidth: Infinity })] : [fillMaxWidth()]
                  }
                >
                  {t('messages.decline')}
                </NativeText>
              </NativeButton>
            </Host>
          </View>
        </View>
      </ScrollView>
    </>
  );
};

export default ValidationDataAccessRequestScreen;
