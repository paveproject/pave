import { useCallback, useEffect } from 'react';
import { Alert, Platform, ScrollView } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, Text as NativeText } from '@expo/ui';
import { buttonStyle, controlSize, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useTranslations } from 'use-intl';
import { useApproveDeviceMutation, useDeclineDeviceMutation } from '@libs/query-client';
import { usePendingAction } from '../../../hooks/usePendingAction';
import { useModalHeaderOptions } from '../../../hooks/useModalHeaderOptions';
import { useTheme } from '../../../providers/ThemeProvider';
import { useToast } from '../../../components/Toast';
import { NativeButton } from '../../../components/ui/NativeButton';
import { Button } from '../../../components/ui/Button';
import { Text } from '../../../components/ui/text';
import { View } from '../../../components/ui/view';
import { isAndroid, isIpad } from '../../../platform/detection';
import { Icons } from '../../../constants/IconsOld';
import { logger } from '../../../logger';
import { DEVICE_TYPE_LABEL } from '../../../utils/deviceTypeLabel';
import tw from '../../../lib/tw';

/**
 * Pushed by `usePendingActionsGate`, only ever reachable while
 * `Stack.Protected`'s guard in the root layout holds (at least one
 * pending device approval exists) - see that guard's own comment for why
 * it's coarse ("some item of this kind"), not scoped to this exact `id`.
 * This screen closes itself (not the gate) the instant `usePendingAction`
 * can no longer find this specific one - resolved by this device,
 * resolved elsewhere, or revoked - rather than ever showing stale content.
 *
 * Android doesn't attach a native header for `formSheet` presentation at
 * all (react-native-screens skips the Toolbar entirely for that
 * presentation) - iOS renders one fine through `useModalHeaderOptions` +
 * `Stack.Screen`, so only Android needs one drawn by hand below.
 */
const ValidationDeviceScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme, colors, mode, isLiquidGlassAvailable } = useTheme();
  const t = useTranslations();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const navigationHeaderHeight = useHeaderHeight();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });
  const bottomInset = isIpad || isAndroid ? insets.bottom : 0;
  const action = usePendingAction('device_registration', id);
  const approve = useApproveDeviceMutation();
  const decline = useDeclineDeviceMutation();
  const isBusy = approve.isPending || decline.isPending;

  useEffect(() => {
    if (!action) router.back();
  }, [action, router]);

  const handleApprove = useCallback(() => {
    if (!action) return;
    Alert.alert(
      t('pages.pending_actions.device.approve_confirm_title'),
      t('pages.pending_actions.device.approve_confirm_message'),
      [
        { text: t('messages.cancel'), style: 'cancel' },
        {
          text: t('messages.approve'),
          onPress: () => {
            approve.mutate(action.id, {
              onError: (error) => {
                toast.error(t('messages.an_error_occurred'));
                logger.error('approve device error', { error });
              },
            });
          },
        },
      ],
      { userInterfaceStyle: mode },
    );
  }, [t, mode, approve, action, toast]);

  const handleDecline = useCallback(() => {
    if (!action) return;
    decline.mutate(action.id, {
      onError: (error) => {
        toast.error(t('messages.an_error_occurred'));
        logger.error('decline device error', { error });
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
                {t('pages.pending_actions.device.title')}
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
          <Text textColor="muted">{t('pages.pending_actions.device.body')}</Text>
          <View
            style={{
              gap: theme.spaces.xs,
              padding: theme.spaces.md,
              backgroundColor: colors.muted,
              borderRadius: theme.border.radius.md,
            }}
          >
            <Text style={{ fontWeight: '600' }}>{DEVICE_TYPE_LABEL[action.deviceType]}</Text>
            {action.locationCity && action.locationCountry && (
              <>
                <Text>
                  {t('pages.pending_actions.device.location', {
                    city: action.locationCity,
                    country: action.locationCountry,
                  })}
                </Text>
                <Text textColor="muted" style={{ fontSize: 12 }}>
                  {t('pages.pending_actions.device.location_approximate')}
                </Text>
              </>
            )}
          </View>
          <View style={{ gap: theme.spaces.sm }}>
            <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
              <NativeButton
                disabled={isBusy}
                onPress={handleApprove}
                colors={{
                  containerColor: colors.secondary,
                  contentColor: colors.secondaryForeground,
                }}
                iosModifiers={[
                  buttonStyle(isLiquidGlassAvailable ? 'glassProminent' : 'borderedProminent'),
                  controlSize('extraLarge'),
                  tint(colors.secondary),
                ]}
                androidModifiers={[fillMaxWidth()]}
              >
                <NativeText
                  textStyle={{ color: colors.secondaryForeground, textAlign: 'center' }}
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

export default ValidationDeviceScreen;
