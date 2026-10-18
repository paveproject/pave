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
  useApproveRecoveryRequestMutation,
  useDeclineRecoveryRequestMutation,
} from '@libs/query-client';
import { sealShareForRecoveryRequest } from '../../../lib/recoveryKey';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { useModalHeaderOptions } from '../../../hooks/useModalHeaderOptions';
import { useTheme } from '../../../providers/ThemeProvider';
import { useAuth } from '../../../providers/AuthProvider';
import { useToast } from '../../../components/Toast';
import { NativeButton } from '../../../components/ui/NativeButton';
import { Button } from '../../../components/ui/Button';
import { Avatar } from '../../../components/ui/Avatar';
import { Text } from '../../../components/ui/text';
import { View } from '../../../components/ui/view';
import { isAndroid, isIpad } from '../../../platform/detection';
import { Icons } from '../../../constants/IconsOld';
import { logger } from '../../../logger';
import tw from '../../../lib/tw';

/**
 * Pushed by `usePendingActionsGate` - see
 * `validation/device/[id].tsx`'s own doc comment, same reasoning applies
 * here for the `recovery_request_contact` kind (including the Android
 * custom-header note).
 */
const ValidationRecoveryRequestScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, colors, mode } = useTheme();
  const t = useTranslations();
  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigationHeaderHeight = useHeaderHeight();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });
  const bottomInset = isIpad ? insets.bottom : 0;
  const action = usePendingAction('recovery_request_contact', id);
  const approve = useApproveRecoveryRequestMutation();
  const decline = useDeclineRecoveryRequestMutation();
  const isBusy = approve.isPending || decline.isPending;

  useEffect(() => {
    if (!action) router.back();
  }, [action, router]);

  const ownerName = action?.owner.username ?? t('pages.pending_actions.recovery_request.someone');

  const handleApprove = useCallback(() => {
    if (!action || !user) return;
    Alert.alert(
      t('pages.pending_actions.recovery_request.approve_confirm_title'),
      t('pages.pending_actions.recovery_request.approve_confirm_message', { ownerName }),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        {
          text: t('pages.pending_actions.recovery_request.approve'),
          style: 'destructive',
          onPress: async () => {
            const encryptedShare = await sealShareForRecoveryRequest(
              user.id,
              action.owner.id,
              action.requestingDevicePublicKey,
            );
            if (!encryptedShare) {
              // This device never actually held a share for that owner -
              // shouldn't normally happen (the row wouldn't exist
              // otherwise), but decline gracefully rather than hang on an
              // approval that can never succeed.
              decline.mutate(action.recoveryRequestId);
              return;
            }
            approve.mutate(
              { recoveryRequestId: action.recoveryRequestId, encryptedShare },
              {
                onError: (error) => {
                  toast.error(t('messages.an_error_occurred'));
                  logger.error('approve recovery request error', { error });
                },
              },
            );
          },
        },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, mode, ownerName, action, approve, decline, toast, user]);

  const handleDecline = useCallback(() => {
    if (!action) return;
    decline.mutate(action.recoveryRequestId, {
      onError: (error) => {
        toast.error(t('messages.an_error_occurred'));
        logger.error('decline recovery request error', { error });
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
              disabled={isBusy}
              onPress={() => router.dismiss()}
              style={tw`rounded-full`}
            />
            <View pointerEvents="none" style={tw`items-center justify-center absolute inset-0`}>
              <Text variant="title" numberOfLines={1}>
                {t('pages.pending_actions.recovery_request.title')}
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
            <Avatar uri={action.owner.image} size={theme.spaces['3xl']} />
            <Text style={{ fontWeight: '600' }}>{ownerName}</Text>
          </View>
          <Text textColor="muted">
            {t('pages.pending_actions.recovery_request.body', { ownerName })}
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
                  buttonStyle('glassProminent'),
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
                  {t('pages.pending_actions.recovery_request.approve')}
                </NativeText>
              </NativeButton>
            </Host>
            <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
              <NativeButton
                disabled={isBusy}
                onPress={handleDecline}
                colors={{ containerColor: colors.muted, contentColor: colors.foreground }}
                iosModifiers={[
                  buttonStyle('glassProminent'),
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
                  {t('pages.pending_actions.recovery_request.decline')}
                </NativeText>
              </NativeButton>
            </Host>
          </View>
        </View>
      </ScrollView>
    </>
  );
};

export default ValidationRecoveryRequestScreen;
