import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useQuery } from '@tanstack/react-query';
import { Host, Icon as NativeIcon, Text as NativeText, Row } from '@expo/ui';
import { buttonStyle, controlSize, foregroundStyle, tint } from '@expo/ui/swift-ui/modifiers';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import QRCode from 'react-native-qrcode-svg';
import { Stack, useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { trustedContactInviteOptions, useRedeemInviteMutation } from '@libs/query-client';
import { useTheme } from '../../../../providers/ThemeProvider';
import { useModalHeaderOptions } from '../../../../hooks/useModalHeaderOptions';
import { useToast } from '../../../../components/Toast';
import { logger } from '../../../../logger';
import { View } from '../../../../components/ui/view';
import { Text } from '../../../../components/ui/text';
import { Input } from '../../../../components/ui/Input';
import { NativeButton } from '../../../../components/ui/NativeButton';
import { SegmentedControl } from '../../../../components/ui/SegmentedControl';
import { Skeleton } from '../../../../components/ui/Skeleton';
import Empty from '../../../../components/ui/empty';
import { Icons as NativeIcons } from '../../../../constants/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isIpad } from '../../../../platform/detection';

type Mode = 'share' | 'scan';

// After a failed scan, how long to wait before the camera is allowed to
// trigger another redeem attempt - resetting immediately re-fires on the
// very next frame since the same QR code is almost always still in view.
const SCAN_COOLDOWN_MS = 2000;

const AddTrustedContactScreen = () => {
  const t = useTranslations();
  const router = useRouter();
  const { theme, colors } = useTheme();
  const toast = useToast();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });
  const insets = useSafeAreaInsets();
  const bottomInset = isIpad ? insets.bottom : 0;

  const [mode, setMode] = useState<Mode>('share');
  const [manualCode, setManualCode] = useState('');

  const {
    data: invite,
    isPending: isGeneratingInvite,
    isFetching: isRefreshingInvite,
    isError: inviteFailed,
    refetch: refetchInvite,
  } = useQuery(trustedContactInviteOptions());
  const redeemInvite = useRedeemInviteMutation();

  const [permission, requestPermission] = useCameraPermissions();
  const autoRequestedRef = useRef(false);
  const hasScannedRef = useRef(false);

  // Ask for camera access once, the first time the "scan" pane is shown -
  // further attempts are the user's own explicit button press.
  useEffect(() => {
    if (mode !== 'scan' || autoRequestedRef.current || !permission) return;
    if (permission.granted || !permission.canAskAgain) return;
    autoRequestedRef.current = true;
    requestPermission();
  }, [mode, permission, requestPermission]);

  const handleRedeem = useCallback(
    (code: string, options?: { onError?: () => void }) => {
      const trimmed = code.trim().toUpperCase();
      if (!trimmed) return;
      redeemInvite.mutate(trimmed, {
        onSuccess: () => {
          toast.success(t('pages.settings.trusted_contacts.add.success'));
          router.dismiss();
        },
        onError: (error) => {
          toast.error(t('messages.invalid_or_expired_code'));
          logger.error('redeem invite error', { error });
          options?.onError?.();
        },
      });
    },
    [redeemInvite, toast, t, router],
  );

  const handleBarcodeScanned = useCallback(
    (result: BarcodeScanningResult) => {
      if (hasScannedRef.current || !result.data) return;
      hasScannedRef.current = true;
      handleRedeem(result.data, {
        onError: () => {
          setTimeout(() => {
            hasScannedRef.current = false;
          }, SCAN_COOLDOWN_MS);
        },
      });
    },
    [handleRedeem],
  );

  const handleCopyCode = useCallback(async () => {
    if (!invite) return;
    await Clipboard.setStringAsync(invite.code);
    toast.success(t('messages.code_copied'));
  }, [invite, toast, t]);

  // `style={{ backgroundColor }}` on a native Button is a no-op - the
  // background has to come from `tint` (iOS) modifiers / the Material3
  // `colors` prop (Android), which is what `NativeButton` wraps.
  const mutedButtonIosModifiers = [
    buttonStyle('glassProminent'),
    tint(colors.muted),
    foregroundStyle(colors.foreground),
  ];
  const mutedButtonColors = {
    containerColor: colors.muted,
    contentColor: colors.foreground,
  };

  const submitButtonIosModifiers = [
    buttonStyle('glassProminent'),
    controlSize('extraLarge'),
    tint(colors.secondary),
    foregroundStyle(colors.secondaryForeground),
  ];
  const submitButtonColors = {
    containerColor: colors.secondary,
    contentColor: colors.secondaryForeground,
  };

  return (
    <>
      <Stack.Screen options={modalHeaderOptions} />
      <ScrollView
        bounces={false}
        contentContainerStyle={{
          paddingTop: theme.spaces.vertical,
          paddingLeft: insets.left + theme.spaces.horizontal,
          paddingRight: insets.right + theme.spaces.horizontal,
          paddingBottom: bottomInset + theme.spaces.vertical,
          gap: theme.spaces.lg,
          alignItems: 'center',
        }}
      >
        <SegmentedControl
          style={{ width: '100%' }}
          values={[t('messages.share_my_code'), t('messages.scan_my_code')]}
          selectedIndex={mode === 'share' ? 0 : 1}
          onChange={(event) =>
            setMode(event.nativeEvent.selectedSegmentIndex === 0 ? 'share' : 'scan')
          }
        />

        {mode === 'share' ? (
          <View style={{ alignItems: 'center', gap: theme.spaces.md, width: '100%' }}>
            {inviteFailed ? (
              <Empty icon={NativeIcons.error} title={t('messages.an_error_occurred')} />
            ) : (
              <>
                <Text textColor="muted" style={{ textAlign: 'center' }}>
                  {t('pages.settings.trusted_contacts.add.share.description')}
                </Text>

                {!isGeneratingInvite && invite ? (
                  <View
                    style={{
                      backgroundColor: '#fff',
                      padding: theme.spaces.md,
                      borderRadius: theme.border.radius.md,
                    }}
                  >
                    <QRCode value={invite.code} size={200} />
                  </View>
                ) : (
                  <Skeleton
                    style={{
                      width: 200 + theme.spaces.md * 2,
                      height: 200 + theme.spaces.md * 2,
                    }}
                    borderRadius={theme.border.radius.md}
                  />
                )}

                <Text textColor="muted" style={{ textAlign: 'center' }}>
                  {t('messages.or_enter_manually')}
                </Text>

                {!isGeneratingInvite && invite ? (
                  <Host matchContents>
                    <NativeButton
                      onPress={handleCopyCode}
                      colors={mutedButtonColors}
                      iosModifiers={mutedButtonIosModifiers}
                    >
                      <Row spacing={theme.spaces.sm} alignment="center">
                        <NativeText textStyle={{ letterSpacing: 2, color: colors.foreground }}>
                          {invite.code}
                        </NativeText>
                        <NativeIcon name={NativeIcons.copy} size={20} color={colors.foreground} />
                      </Row>
                    </NativeButton>
                  </Host>
                ) : (
                  <Skeleton
                    style={{ width: 160, height: 46 }}
                    borderRadius={theme.border.radius.full}
                  />
                )}

                <Text textColor="muted" style={{ textAlign: 'center' }}>
                  {t('messages.expires_in_value_hours', { value: 24 })}
                </Text>

                {!isGeneratingInvite ? (
                  <Host matchContents>
                    <NativeButton
                      disabled={isRefreshingInvite}
                      onPress={() => refetchInvite()}
                      colors={mutedButtonColors}
                      iosModifiers={mutedButtonIosModifiers}
                    >
                      <Row spacing={theme.spaces.sm} alignment="center">
                        <NativeIcon
                          name={NativeIcons.refresh}
                          size={20}
                          color={colors.foreground}
                        />
                        <NativeText textStyle={{ color: colors.foreground }}>
                          {t('messages.refresh')}
                        </NativeText>
                      </Row>
                    </NativeButton>
                  </Host>
                ) : null}
              </>
            )}
          </View>
        ) : (
          <View style={{ alignItems: 'center', gap: theme.spaces.md, width: '100%' }}>
            <Text textColor="muted" style={{ textAlign: 'center' }}>
              {t('messages.scan_code_or_enter_code_manually')}
            </Text>

            {permission?.granted ? (
              <View
                style={[
                  styles.cameraContainer,
                  { borderRadius: theme.border.radius.md, borderColor: colors.border },
                ]}
              >
                <CameraView
                  style={StyleSheet.absoluteFill}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
                  onBarcodeScanned={handleBarcodeScanned}
                />
              </View>
            ) : (
              <View style={{ alignItems: 'center', gap: theme.spaces.sm }}>
                <Host style={{ width: 32, height: 32 }}>
                  <NativeIcon name={NativeIcons.camera} size={32} color={colors.mutedForeground} />
                </Host>
                <Text textColor="muted" style={{ textAlign: 'center' }}>
                  {t('messages.camera_access_needed_to_scan_code')}
                </Text>
                {permission?.canAskAgain ? (
                  <Host matchContents>
                    <NativeButton
                      onPress={requestPermission}
                      colors={mutedButtonColors}
                      iosModifiers={mutedButtonIosModifiers}
                    >
                      <NativeText textStyle={{ color: colors.foreground }}>
                        {t('messages.grant_camera_access')}
                      </NativeText>
                    </NativeButton>
                  </Host>
                ) : (
                  <Host matchContents>
                    <NativeButton
                      onPress={() => Linking.openSettings()}
                      colors={mutedButtonColors}
                      iosModifiers={mutedButtonIosModifiers}
                    >
                      <NativeText textStyle={{ color: colors.foreground }}>
                        {t('messages.open_settings')}
                      </NativeText>
                    </NativeButton>
                  </Host>
                )}
              </View>
            )}

            <Input
              value={manualCode}
              onChangeText={setManualCode}
              placeholder={t('messages.value_character_code', { count: 8 })}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={8}
              containerStyle={{ width: '100%' }}
            />
            <Host matchContents>
              <NativeButton
                disabled={!manualCode.trim() || redeemInvite.isPending}
                onPress={() => handleRedeem(manualCode)}
                colors={submitButtonColors}
                iosModifiers={submitButtonIosModifiers}
              >
                <NativeText textStyle={{ color: colors.secondaryForeground }}>
                  {t('messages.redeem')}
                </NativeText>
              </NativeButton>
            </Host>
          </View>
        )}
      </ScrollView>
    </>
  );
};

const styles = StyleSheet.create({
  cameraContainer: {
    width: '100%',
    height: 260,
    overflow: 'hidden',
    borderWidth: 1,
  },
});

export default AddTrustedContactScreen;
