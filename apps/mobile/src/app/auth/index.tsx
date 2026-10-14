import { useCallback, useState } from 'react';
import { Platform } from 'react-native';
import { Host, Button, Icon, Row, Text as NativeText } from '@expo/ui';
import {
  buttonStyle,
  controlSize,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useTheme } from '../../providers/ThemeProvider';
import { Stack, useRouter } from 'expo-router';
import tw from '../../lib/tw';
import { Input } from '../../components/ui/Input';
import { NativeButton } from '../../components/ui/NativeButton';
import { Icons as LegacyIcons } from '../../constants/IconsOld';
import { useTranslations } from 'use-intl';
import * as z from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Text } from '../../components/ui/text';
import { InputOTP } from '../../components/ui/input-otp';
import { View } from '../../components/ui/view';
import { useToast } from '../../components/Toast';
import { logger } from '../../logger';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSendOtpMutation, useVerifyOtpMutation } from '@libs/query-client';
import { useModalHeaderOptions } from '../../hooks/useModalHeaderOptions';
import { useAuth } from '../../providers/AuthProvider';
import { useLocaleContext } from '../../providers/LocaleProvider';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { isIpad } from '../../platform/detection';

const OTP_LENGTH = 6;

const emailSchema = z.object({
  email: z.email(),
});
type EmailFormValues = z.infer<typeof emailSchema>;

const AuthScreen = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, theme, mode } = useTheme();
  const toast = useToast();
  const t = useTranslations();
  const { locale } = useLocaleContext();
  const { setSession } = useAuth();
  const modalHeaderOptions = useModalHeaderOptions({
    forceCross: true,
  });
  const navigationHeaderHeight = useHeaderHeight();
  const [showOtp, setShowOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const bottomInset = isIpad ? insets.bottom : 0;

  const { mutateAsync: sendOtp, isPending: isSending } = useSendOtpMutation();
  const { mutateAsync: verifyOtp, isPending: isVerifying } = useVerifyOtpMutation();
  const isLoading = isSending || isVerifying;

  const { getValues: formGetValues, ...form } = useForm<EmailFormValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: '' },
    mode: 'onChange',
  });

  const handleSendOtp = useCallback(
    async (data: EmailFormValues) => {
      try {
        await sendOtp({ email: data.email, lang: locale });
        toast.success(t('messages.code_sent'));
        setShowOtp(true);
      } catch (error) {
        toast.error(t('messages.an_error_occurred'));
        logger.error('otp send error', { error });
      }
    },
    [sendOtp, locale, toast, t],
  );

  const handleVerifyOtp = useCallback(
    async (code: string) => {
      try {
        const { token } = await verifyOtp({ email: formGetValues('email'), code });
        await setSession(token);
        logger.metric('account:loggedIn', { logContext: 'AuthScreen' });
        toast.success(t('messages.code_verified'));
        if (router.canGoBack()) {
          router.back();
        } else {
          router.replace({ pathname: '/(tabs)/(home)' });
        }
      } catch (error) {
        toast.error(t('messages.invalid_or_expired_code'));
        logger.metric('account:loginFailed', { logContext: 'AuthScreen', reason: String(error) });
      } finally {
        setOtp('');
      }
    },
    [verifyOtp, formGetValues, setSession, toast, t, router],
  );

  // Not wired up yet - placeholder entry points for the social sign-in flows.
  const handleSocialPlaceholder = useCallback(() => {
    toast.info(t('messages.coming_soon'));
  }, [toast, t]);

  const socialButtonIosModifiers = [
    buttonStyle('glassProminent'),
    controlSize('extraLarge'),
    tint(colors.muted),
    foregroundStyle(colors.foreground),
  ];
  const socialButtonColors = {
    containerColor: colors.muted,
    contentColor: colors.foreground,
  };

  return (
    <>
      <Stack.Screen options={modalHeaderOptions} />
      <View
        style={[
          tw`flex-1 justify-start items-center`,
          {
            gap: theme.spaces.md,
            paddingTop: navigationHeaderHeight + theme.spaces.vertical,
            paddingLeft: insets.left + theme.spaces.horizontal,
            paddingRight: insets.right + theme.spaces.horizontal,
            paddingBottom: bottomInset,
          },
        ]}
      >
        {!showOtp ? (
          <View style={[tw`w-full`, { gap: theme.spaces.md }]}>
            <Controller
              name="email"
              control={form.control}
              render={({ field: { onChange, onBlur, value } }) => (
                <Input
                  nativeID="email"
                  placeholder={t('messages.email')}
                  autoComplete="email"
                  autoCapitalize="none"
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  disabled={isLoading}
                  keyboardType="email-address"
                  error={form.formState.errors.email?.message}
                />
              )}
            />
            <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
              <NativeButton
                disabled={isLoading}
                onPress={form.handleSubmit(handleSendOtp)}
                colors={{
                  containerColor: colors.secondary,
                  contentColor: colors.secondaryForeground,
                }}
                iosModifiers={[
                  buttonStyle('glassProminent'),
                  controlSize('extraLarge'),
                  tint(colors.secondary),
                  foregroundStyle(colors.secondaryForeground),
                ]}
                androidModifiers={[fillMaxWidth()]}
              >
                <NativeText
                  textStyle={{ color: colors.secondaryForeground, textAlign: 'center' }}
                  modifiers={
                    // iOS quirk: a frame modifier on the Button itself doesn't
                    // stretch it - SwiftUI only honors maxWidth on the label
                    // content, so the Text child needs its own frame.
                    Platform.OS === 'ios' ? [frame({ maxWidth: Infinity })] : [fillMaxWidth()]
                  }
                >
                  {t('messages.continue')}
                </NativeText>
              </NativeButton>
            </Host>

            <View style={tw`flex-row items-center gap-3`}>
              <View style={[tw`flex-1 h-px`, { backgroundColor: colors.border }]} />
              <Text textColor="muted" style={tw`text-base font-bold`}>
                {t('messages.or')}
              </Text>
              <View style={[tw`flex-1 h-px`, { backgroundColor: colors.border }]} />
            </View>

            <View style={{ gap: theme.spaces.md, width: '100%' }}>
              <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
                <NativeButton
                  onPress={handleSocialPlaceholder}
                  colors={socialButtonColors}
                  iosModifiers={socialButtonIosModifiers}
                  androidModifiers={[fillMaxWidth()]}
                >
                  <Row
                    alignment="center"
                    modifiers={
                      Platform.OS === 'ios'
                        ? [frame({ maxWidth: Infinity, alignment: 'center' })]
                        : undefined
                    }
                  >
                    {/* The stretch lives on this outer Row only - the inner
                        one stays hugged so the icon and label never drift
                        apart, regardless of how the RN-bridged icon below
                        reports its own native size. */}
                    <Row spacing={theme.spaces.md} alignment="center">
                      {/* No native SF Symbol / Material Symbol for Google's
                          logo on either platform - the custom SVG is the
                          only option, Google doesn't ship one either. */}
                      <View style={{ width: theme.icons.sizes.sm, height: theme.icons.sizes.sm }}>
                        <LegacyIcons.brands.google size={theme.icons.sizes.sm} />
                      </View>
                      <NativeText textStyle={{ color: colors.foreground }}>Google</NativeText>
                    </Row>
                  </Row>
                </NativeButton>
              </Host>
              <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
                <NativeButton
                  onPress={handleSocialPlaceholder}
                  colors={socialButtonColors}
                  iosModifiers={socialButtonIosModifiers}
                  androidModifiers={[fillMaxWidth()]}
                >
                  <Row
                    alignment="center"
                    modifiers={
                      Platform.OS === 'ios'
                        ? [frame({ maxWidth: Infinity, alignment: 'center' })]
                        : undefined
                    }
                  >
                    <Row spacing={theme.spaces.md} alignment="center">
                      {Platform.OS === 'ios' ? (
                        // Apple's own logo is a real SF Symbol - iOS only,
                        // Android has no equivalent so it keeps the SVG.
                        <Icon
                          name="apple.logo"
                          size={theme.icons.sizes.sm}
                          color={colors.foreground}
                        />
                      ) : (
                        <View style={{ width: theme.icons.sizes.sm, height: theme.icons.sizes.sm }}>
                          <LegacyIcons.brands.apple
                            size={theme.icons.sizes.sm}
                            variant={mode === 'dark' ? 'dark' : 'light'}
                          />
                        </View>
                      )}
                      <NativeText textStyle={{ color: colors.foreground }}>Apple</NativeText>
                    </Row>
                  </Row>
                </NativeButton>
              </Host>
            </View>
          </View>
        ) : (
          <>
            <View style={tw`gap-2 items-center`}>
              <Text variant="title">{t('messages.check_your_email')}</Text>
              <Text textColor="muted">
                {t('messages.enter_code_sent_to_email', {
                  email: formGetValues('email'),
                })}
              </Text>
            </View>
            <InputOTP
              length={OTP_LENGTH}
              value={otp}
              onChangeText={setOtp}
              onComplete={handleVerifyOtp}
            />
            <View style={tw`items-center`}>
              <Text textColor="muted">{t('messages.not_received_code')} </Text>
              <Host matchContents>
                <Button
                  variant="text"
                  label={t('messages.resend_code')}
                  disabled={isLoading}
                  onPress={form.handleSubmit(handleSendOtp)}
                />
              </Host>
            </View>
          </>
        )}
      </View>
    </>
  );
};

export default AuthScreen;
