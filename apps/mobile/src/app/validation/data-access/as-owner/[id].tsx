import { useCallback, useEffect } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, Text as NativeText } from '@expo/ui';
import { buttonStyle, controlSize, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useFormatter, useTranslations } from 'use-intl';
import { useDataAccessRequestRefuseMutation } from '@libs/query-client';
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
 * Pushed by `usePendingActionsGate` for `data_access_request_owner`.
 *
 * The one validation sheet with a single button: doing nothing is already an
 * answer here, so the cross is the other half of the choice - which the body
 * has to say, or a lone destructive button reads as a trap.
 */
const ValidationDataAccessAsOwnerScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, colors, mode, isLiquidGlassAvailable } = useTheme();
  const t = useTranslations();
  const format = useFormatter();
  const { user } = useAuth();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigationHeaderHeight = useHeaderHeight();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });
  const bottomInset = isIpad ? insets.bottom : 0;
  const action = usePendingAction('data_access_request_owner', id);
  const refuse = useDataAccessRequestRefuseMutation({ userId: user?.id });

  useEffect(() => {
    if (!action) router.back();
  }, [action, router]);

  const requesterName = action?.requester.username ?? t('messages.someone');

  const handleRefuse = useCallback(() => {
    if (!action) return;
    Alert.alert(
      t('pages.pending_actions.data_access_request.owner.refuse_confirm_title'),
      t('pages.pending_actions.data_access_request.owner.refuse_confirm_message', {
        requesterName,
      }),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        {
          text: t('pages.pending_actions.data_access_request.owner.refuse'),
          style: 'destructive',
          onPress: () => {
            refuse.mutate(action.id, {
              onError: (error) => {
                toast.error(t('messages.an_error_occurred'));
                logger.error('refuse data access request error', { error });
              },
            });
          },
        },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, mode, requesterName, action, refuse, toast]);

  if (!action) return null;

  const isOpen = action.access === 'open';

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
              disabled={refuse.isPending}
              onPress={() => router.dismiss()}
              style={tw`rounded-full`}
            />
            <View pointerEvents="none" style={tw`items-center justify-center absolute inset-0`}>
              <Text variant="title" numberOfLines={1}>
                {t('pages.pending_actions.data_access_request.owner.sheet_title')}
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
            <Avatar uri={action.requester.image} size={theme.spaces['3xl']} />
            <Text style={{ fontWeight: '600' }}>{requesterName}</Text>
          </View>

          <Text textColor="muted">
            {isOpen
              ? t('pages.pending_actions.data_access_request.owner.open_body', {
                  requesterName,
                  expiresAt: format.dateTime(new Date(action.expiresAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })
              : t('pages.pending_actions.data_access_request.owner.waiting_body', {
                  requesterName,
                  approved: action.approvedContacts,
                  required: action.requiredApprovals,
                  releaseAt: format.dateTime(new Date(action.releaseAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })}
          </Text>

          <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
            <NativeButton
              disabled={refuse.isPending}
              onPress={handleRefuse}
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
                {t('pages.pending_actions.data_access_request.owner.refuse')}
              </NativeText>
            </NativeButton>
          </Host>

          {/* The cross is the other answer; not obvious unless said. */}
          <Text textColor="muted" style={{ fontSize: theme.fonts.sizes.xs }}>
            {t('pages.pending_actions.data_access_request.owner.dismiss_hint')}
          </Text>
        </View>
      </ScrollView>
    </>
  );
};

export default ValidationDataAccessAsOwnerScreen;
