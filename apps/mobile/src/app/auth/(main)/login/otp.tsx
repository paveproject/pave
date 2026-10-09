import { useCallback, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../../../components/ui/Button';
import { Link, Stack, useNavigation } from 'expo-router';
import tw from '../../../../lib/tw';
import { useTheme } from '../../../../providers/ThemeProvider';
import { GroupedInput, GroupedInputItem } from '../../../../components/ui/Input';
import { upperFirst } from 'lodash';
import { Icons } from '../../../../constants/Icons';
import { useTranslations } from 'use-intl';
import * as z from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Text } from '../../../../components/ui/text';
import { InputOTP } from '../../../../components/ui/input-otp';
import { KeyboardAwareScrollView } from '../../../../components/ui/KeyboardAwareScrollView';
import { GAP, PADDING_HORIZONTAL, PADDING_VERTICAL } from '../../../../theme/globals';
import { View } from '../../../../components/ui/view';
import { KeyboardToolbar } from '../../../../components/ui/KeyboardToolbar';
import { useToast } from '../../../../components/Toast';
import { logger } from '../../../../logger';
import { LoopCarousel } from '../../../../components/ui/LoopCarousel';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { uiBackgroundsOptions } from '../../../../api/ui/uiOptions';
import { authClient } from '../../../../lib/auth/client';
import { useModalHeaderOptions } from '../../../../hooks/useModalHeaderOptions';

const LoginOtpScreen = () => {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const t = useTranslations();
  const [isLoading, setIsLoading] = useState(false);
  const navigation = useNavigation();
  const modalHeaderOptions = useModalHeaderOptions();
  const routes = navigation.getState()?.routes;
  const prevRoute = routes ? routes[routes.length - 2] : null;
  // OTP
  const numberOfDigits = 6;
  const [showOtp, setShowOtp] = useState<boolean>(false);
  const [otp, setOtp] = useState('');

  const { data: backgrounds } = useQuery(uiBackgroundsOptions());

  /* ------------------------------- FORM SCHEMA ------------------------------ */
  const forgotPasswordSchema = z.object({
    email: z.email({
      error: t('common.form.email.error.invalid'),
    }),
  });
  type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
  const defaultValues: Partial<ForgotPasswordFormValues> = {
    email: '',
  };
  const { getValues: formGetValues, ...form } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: defaultValues,
    mode: 'onChange',
  });
  /* -------------------------------------------------------------------------- */

  // Handlers
  const handleSubmit = useCallback(
    async (data: ForgotPasswordFormValues) => {
      try {
        setIsLoading(true);
        const { error } = await authClient.emailOtp.sendVerificationOtp({
          email: data.email,
          type: 'sign-in',
        });
        if (error) {
          switch (error.code) {
            default:
              toast.error(upperFirst(t('common.messages.an_error_occurred')));
              logger.error('login with otp error', { error });
              break;
          }
          throw error;
        }
        toast.success(upperFirst(t('common.form.code_sent')));
        setShowOtp(true);
      } finally {
        setIsLoading(false);
      }
    },
    [t, toast, logger],
  );
  const handleVerifyOtp = useCallback(
    async (otp: string) => {
      try {
        setIsLoading(true);
        const { error } = await authClient.emailOtp.checkVerificationOtp({
          email: formGetValues('email'),
          type: 'sign-in',
          otp,
        });
        if (error) {
          switch (error.code) {
            case 'INVALID_OTP':
              toast.error(t('common.form.error.invalid_code'));
              logger.metric('account:loginFailed', {
                logContext: 'LoginOtpScreen',
                reason: error.code,
              });
              break;
            default:
              toast.error(upperFirst(t('common.messages.an_error_occurred')));
              logger.error('otp verification error', { error });
              break;
          }
          throw error;
        }
        logger.metric('account:loggedIn', {
          logContext: 'LoginOtpScreen',
          withPassword: false,
        });
        toast.success(upperFirst(t('common.form.code_verified')));
        await queryClient.resetQueries();
      } finally {
        setIsLoading(false);
        setOtp('');
      }
    },
    [t, toast, logger, formGetValues],
  );
  return (
    <>
      <Stack.Screen options={modalHeaderOptions} />
      {backgrounds && (
        <LoopCarousel
          items={backgrounds}
          containerStyle={tw`absolute inset-0`}
          renderItem={(item) => (
            <Image source={item.localUri} contentFit="cover" style={tw`w-full h-full`} />
          )}
        />
      )}
      <LinearGradient
        colors={['transparent', 'rgba(0, 0, 0, 0.8)']}
        start={{
          x: 0,
          y: 0,
        }}
        end={{
          x: 0,
          y: 0.7,
        }}
        style={tw`flex-1`}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={[
            tw`flex-1 justify-end items-center`,
            {
              gap: GAP,
              paddingLeft: insets.left + PADDING_HORIZONTAL,
              paddingRight: insets.right + PADDING_HORIZONTAL,
              paddingBottom: insets.bottom + PADDING_VERTICAL,
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {!showOtp ? (
            <>
              <View style={[tw`w-full`, { gap: GAP }]}>
                <GroupedInput
                  title={t('common.messages.otp')}
                  titleStyle={tw`text-center text-xl font-bold`}
                >
                  <Controller
                    name="email"
                    control={form.control}
                    render={({ field: { onChange, onBlur, value } }) => (
                      <GroupedInputItem
                        icon={Icons.Mail}
                        nativeID="email"
                        placeholder={upperFirst(t('common.form.email.label'))}
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
                </GroupedInput>
                {/* SUBMIT BUTTON */}
                <Button
                  loading={isLoading}
                  onPress={form.handleSubmit(handleSubmit)}
                  style={tw`w-full rounded-xl`}
                >
                  {t('pages.auth.login.otp.form.submit')}
                </Button>
              </View>
              <Text textColor="muted" style={tw`text-center`}>
                {t('pages.auth.login.otp.password_login')}{' '}
                <Link
                  href={prevRoute?.name === 'login/index' ? '../' : '/auth/login'}
                  replace
                  style={{ color: colors.accentYellow }}
                >
                  {upperFirst(t('common.messages.login'))}
                </Link>
              </Text>
            </>
          ) : (
            <>
              <View style={tw`gap-2 items-center`}>
                <Text variant="title">{t('pages.auth.login.otp.confirm_form.label')}</Text>
                <Text textColor="muted">
                  {t('pages.auth.login.otp.confirm_form.description', {
                    email: formGetValues('email'),
                  })}
                </Text>
              </View>
              <InputOTP
                length={numberOfDigits}
                value={otp}
                onChangeText={setOtp}
                onComplete={handleVerifyOtp}
              />
              <View style={tw`items-center`}>
                <Text textColor="muted">{t('common.form.error.not_received_code')} </Text>
                <Button
                  variant="ghost"
                  className="p-0"
                  disabled={isLoading}
                  onPress={form.handleSubmit(handleSubmit)}
                >
                  {t('common.form.resend_code')}
                </Button>
              </View>
            </>
          )}
          {/* RETURNS TO LOGIN */}
        </KeyboardAwareScrollView>
        <KeyboardToolbar />
      </LinearGradient>
    </>
  );
};

export default LoginOtpScreen;
