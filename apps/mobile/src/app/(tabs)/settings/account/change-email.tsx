import { useCallback, useState } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Host, Button } from '@expo/ui';
import { useTranslations } from 'use-intl';
import { useTheme } from '../../../../providers/ThemeProvider';
import { useToast } from '../../../../components/Toast';
import { View } from '../../../../components/ui/view';
import { Text } from '../../../../components/ui/text';
import { InputOTP } from '../../../../components/ui/input-otp';
import { logger } from '../../../../logger';
import { useModalHeaderOptions } from '../../../../hooks/useModalHeaderOptions';
import { useLocaleContext } from '../../../../providers/LocaleProvider';
import { useSendChangeEmailOtpMutation, useVerifyChangeEmailOtpMutation } from '@libs/query-client';
import tw from '../../../../lib/tw';
import { useHeaderHeight } from 'expo-router/react-navigation';

const OTP_LENGTH = 6;

const ChangeEmailScreen = () => {
  const t = useTranslations();
  const router = useRouter();
  const { theme } = useTheme();
  const { locale } = useLocaleContext();
  const toast = useToast();
  const navigationHeaderHeight = useHeaderHeight();
  const { newEmail } = useLocalSearchParams<{ newEmail: string }>();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });

  const [otp, setOtp] = useState('');

  const { mutateAsync: sendChangeEmailOtp, isPending: isResending } =
    useSendChangeEmailOtpMutation();
  const { mutateAsync: verifyChangeEmailOtp, isPending: isVerifying } =
    useVerifyChangeEmailOtpMutation();

  const handleResend = useCallback(async () => {
    try {
      await sendChangeEmailOtp({ newEmail, lang: locale });
      toast.success(t('form.code_sent'));
    } catch (error) {
      toast.error(t('messages.an_error_occurred'));
      logger.error('change-email resend error', { error });
    }
  }, [sendChangeEmailOtp, newEmail, locale, toast, t]);

  const handleVerify = useCallback(
    async (code: string) => {
      try {
        await verifyChangeEmailOtp({ newEmail, code });
        toast.success(t('pages.settings.account.email.updated'));
        router.back();
      } catch (error) {
        toast.error(t('form.error.invalid_code'));
        logger.error('change-email verify error', { error });
      } finally {
        setOtp('');
      }
    },
    [verifyChangeEmailOtp, newEmail, toast, t, router],
  );

  return (
    <>
      <Stack.Screen options={modalHeaderOptions} />
      <View
        style={[
          tw`items-center`,
          {
            gap: theme.spaces.md,
            paddingHorizontal: theme.spaces.horizontal,
            paddingTop: navigationHeaderHeight + theme.spaces.vertical,
          },
        ]}
      >
        <View style={tw`gap-2 items-center`}>
          <Text textColor="muted">
            {t('pages.auth.otp.confirm_form.description', { email: newEmail })}
          </Text>
        </View>
        <InputOTP
          length={OTP_LENGTH}
          value={otp}
          onChangeText={setOtp}
          onComplete={handleVerify}
          disabled={isVerifying}
        />
        <View style={tw`items-center`}>
          <Text textColor="muted">{t('form.error.not_received_code')} </Text>
          <Host matchContents>
            <Button
              variant="text"
              label={t('form.resend_code')}
              disabled={isResending}
              onPress={handleResend}
            />
          </Host>
        </View>
      </View>
    </>
  );
};

export default ChangeEmailScreen;
