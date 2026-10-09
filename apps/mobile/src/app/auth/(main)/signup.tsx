import { useCallback, useEffect, useMemo, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Button } from '../../../components/ui/Button';
import { Link, useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import useDebounce from '../../../hooks/useDebounce';
import { useUsernameAvailability } from '../../../hooks/useUsernameAvailability';
import { Icons } from '../../../constants/Icons';
import tw from '../../../lib/tw';
import { useTheme } from '../../../providers/ThemeProvider';
import { GroupedInput, GroupedInputItem } from '../../../components/ui/Input';
import { upperFirst } from 'lodash';
import { Text } from '../../../components/ui/text';
import { useLocale, useTranslations } from 'use-intl';
import { GAP, PADDING_HORIZONTAL, PADDING_VERTICAL } from '../../../theme/globals';
import { View } from '../../../components/ui/view';
import { KeyboardToolbar } from '../../../components/ui/KeyboardToolbar';
import { OAuthProviders } from '../../../components/OAuth/OAuthProviders';
import { useToast } from '../../../components/Toast';
import { KeyboardAwareScrollView } from '../../../components/ui/KeyboardAwareScrollView';
import { LoopCarousel } from '../../../components/ui/LoopCarousel';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { uiBackgroundsOptions } from '../../../api/ui/uiOptions';
import { authClient } from '../../../lib/auth/client';
import { makeRedirectUri } from 'expo-auth-session';
import { useModalHeaderOptions } from '../../../hooks/useModalHeaderOptions';

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 15;
const FULL_NAME_MIN_LENGTH = 1;
const FULL_NAME_MAX_LENGTH = 50;
const PASSWORD_MIN_LENGTH = 8;

enum STEPS {
  EMAIL = 1,
  EMAIL_VERIFICATION = 2,
}

const verifiedSchema = z.object({
  verified: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional()
    .catch(false),
});

const SignupScreen = () => {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const locale = useLocale();
  const t = useTranslations();
  const router = useRouter();
  const modalHeaderOptions = useModalHeaderOptions();

  const { data: backgrounds } = useQuery(uiBackgroundsOptions());

  const rawParams = useLocalSearchParams();
  const { verified: isVerified } = useMemo(() => verifiedSchema.parse(rawParams), [rawParams]);

  /* ------------------------------- FORM SCHEMA ------------------------------ */
  const signupSchema = z
    .object({
      email: z.email({
        error: t('common.form.email.error.invalid'),
      }),
      username: z
        .string()
        .min(USERNAME_MIN_LENGTH, {
          message: t('common.form.length.char_min', { count: USERNAME_MIN_LENGTH }),
        })
        .max(USERNAME_MAX_LENGTH, {
          message: t('common.form.length.char_max', { count: USERNAME_MAX_LENGTH }),
        })
        .regex(/^[^\W]/, {
          message: t('common.form.username.schema.first_char'),
        })
        .regex(/^(?!.*\.\.)/, {
          message: t('common.form.username.schema.double_dot'),
        })
        .regex(/^(?!.*\.$)/, {
          message: t('common.form.username.schema.ends_with_dot'),
        })
        .regex(/^[\w.]+$/, {
          message: t('common.form.username.schema.format'),
        }),
      full_name: z
        .string()
        .min(FULL_NAME_MIN_LENGTH, {
          message: t('common.form.length.char_min', { count: FULL_NAME_MIN_LENGTH }),
        })
        .max(FULL_NAME_MAX_LENGTH, {
          message: t('common.form.length.char_max', { count: FULL_NAME_MAX_LENGTH }),
        })
        .regex(/^[a-zA-Z0-9\s\S]*$/, {
          message: t('common.form.full_name.schema.format'),
        }),
      password: z
        .string()
        .min(PASSWORD_MIN_LENGTH, {
          message: t('common.form.length.char_min', { count: PASSWORD_MIN_LENGTH }),
        })
        .regex(/[A-Z]/, {
          message: t('common.form.password.schema.uppercase'),
        })
        .regex(/[a-z]/, {
          message: t('common.form.password.schema.lowercase'),
        })
        .regex(/[0-9]/, {
          message: t('common.form.password.schema.number'),
        })
        .regex(/[\W_]/, {
          message: t('common.form.password.schema.special'),
        }),
      confirm_password: z.string(),
    })
    .refine((data) => data.password === data.confirm_password, {
      message: t('common.form.password.schema.match'),
      path: ['confirm_password'],
    });

  type SignupFormValues = z.infer<typeof signupSchema>;

  const defaultValues: Partial<SignupFormValues> = {
    email: '',
    full_name: '',
    username: '',
    password: '',
    confirm_password: '',
  };
  /* -------------------------------------------------------------------------- */

  const [currentStep, setCurrentStep] = useState(STEPS.EMAIL);
  const {
    setError: formSetError,
    getValues: formGetValues,
    ...form
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: defaultValues,
    mode: 'onChange',
  });
  const usernameToCheck = useDebounce(form.watch('username'), 500);
  const { data: isUsernameAvailable, isLoading: isUsernameChecking } = useUsernameAvailability(
    !form.formState.errors.username?.message && usernameToCheck ? usernameToCheck : undefined,
  );

  // Handlers
  const handleSubmit = useCallback(
    async (data: SignupFormValues) => {
      try {
        setIsLoading(true);
        const { error } = await authClient.signUp.email({
          email: data.email,
          name: data.full_name,
          username: data.username,
          password: data.password,
          language: locale,
          callbackURL: makeRedirectUri({
            path: '/auth/signup',
            queryParams: { verified: 'true' },
          }),
        });
        if (error) {
          switch (error.code) {
            case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
              toast.error(t('common.messages.email_already_used'));
              break;
            default:
              toast.error(t('common.messages.an_error_occurred'));
              break;
          }
          throw error;
        }
        setCurrentStep(STEPS.EMAIL_VERIFICATION);
      } finally {
        setIsLoading(false);
      }
    },
    [locale, t, toast],
  );

  const handleFinish = useCallback(() => {
    if (router.canDismiss()) {
      router.dismissTo({
        pathname: '/auth/login',
      });
    } else {
      router.replace({
        pathname: '/auth/login',
      });
    }
  }, [router]);

  const handleResendOtp = useCallback(async () => {
    try {
      setIsLoading(true);
      const { error } = await authClient.sendVerificationEmail({
        email: formGetValues('email'),
        callbackURL: makeRedirectUri({
          path: '/auth/signup',
          queryParams: { verified: 'true' },
        }),
      });
      if (error) {
        switch (error.code) {
          default:
            toast.error(upperFirst(t('common.messages.an_error_occurred')));
            break;
        }
        throw error;
      }
      toast.success(t('common.messages.confirmation_email_sent'));
    } finally {
      setIsLoading(false);
    }
  }, [authClient, formGetValues, toast, t]);

  // useEffects
  useEffect(() => {
    if (isUsernameAvailable === false) {
      formSetError('username', {
        message: t('common.form.username.schema.unavailable'),
      });
    }
  }, [isUsernameAvailable, t]);

  useEffect(() => {
    if (isVerified) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reacts to isVerified with a toast + timed transition, not pure derived state
      setCurrentStep(STEPS.EMAIL_VERIFICATION);
      toast.success(t('common.common.'), { duration: 3000 });

      const timer = setTimeout(() => {
        handleFinish();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isVerified, handleFinish, t, toast]);

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
          y: 0.4,
        }}
        style={tw`flex-1`}
      >
        <KeyboardAwareScrollView
          contentContainerStyle={[
            tw`flex-1 flex-grow justify-end items-center`,
            {
              gap: GAP,
              paddingLeft: insets.left + PADDING_HORIZONTAL,
              paddingRight: insets.right + PADDING_HORIZONTAL,
              paddingBottom: insets.bottom + PADDING_VERTICAL,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          extraKeyboardSpace={-139}
        >
          {(() => {
            switch (currentStep) {
              case STEPS.EMAIL:
                return (
                  <>
                    <View style={[tw`w-full`, { gap: GAP }]}>
                      <GroupedInput
                        title={upperFirst(t('common.messages.signup'))}
                        titleStyle={tw`text-center text-xl font-bold`}
                      >
                        <Controller
                          name="email"
                          control={form.control}
                          render={({ field: { onChange, onBlur, value } }) => (
                            <GroupedInputItem
                              icon={Icons.Mail}
                              placeholder={upperFirst(t('common.form.email.label'))}
                              nativeID="email"
                              inputMode="email"
                              autoComplete="email"
                              autoCapitalize="none"
                              value={value}
                              onChangeText={(value) => onChange(value)}
                              disabled={isLoading}
                              keyboardType="email-address"
                              onBlur={onBlur}
                              error={form.formState.errors.email?.message}
                            />
                          )}
                        />
                        <Controller
                          name="username"
                          control={form.control}
                          render={({ field: { onChange, onBlur, value } }) => (
                            <GroupedInputItem
                              icon={Icons.User}
                              placeholder={t('pages.settings.account.username.label')}
                              disabled={isLoading}
                              autoComplete="username-new"
                              autoCapitalize="none"
                              value={value}
                              autoCorrect={false}
                              onBlur={onBlur}
                              onChangeText={onChange}
                              rightComponent={
                                form.formState.errors.username?.message !==
                                  t('common.form.username.schema.unavailable') &&
                                isUsernameAvailable !== undefined ? (
                                  isUsernameChecking ? (
                                    <Icons.Loader size={16} />
                                  ) : (
                                    <View
                                      style={[
                                        {
                                          backgroundColor: isUsernameAvailable
                                            ? colors.success
                                            : colors.destructive,
                                        },
                                        tw`rounded-full h-4 w-4 items-center justify-center`,
                                      ]}
                                    >
                                      {isUsernameAvailable ? (
                                        <Icons.Check size={12} color={colors.successForeground} />
                                      ) : (
                                        <Icons.Cancel
                                          size={12}
                                          color={colors.destructiveForeground}
                                        />
                                      )}
                                    </View>
                                  )
                                ) : undefined
                              }
                              error={form.formState.errors.username?.message}
                            />
                          )}
                        />
                        <Controller
                          name="full_name"
                          control={form.control}
                          render={({ field: { onChange, onBlur, value } }) => (
                            <GroupedInputItem
                              placeholder={upperFirst(t('common.form.full_name.label'))}
                              icon={Icons.Add}
                              nativeID="full_name"
                              value={value}
                              autoComplete="given-name"
                              autoCapitalize="words"
                              onBlur={onBlur}
                              onChangeText={onChange}
                              disabled={isLoading}
                              error={form.formState.errors.full_name?.message}
                            />
                          )}
                        />
                        <Controller
                          name="password"
                          control={form.control}
                          render={({ field: { onChange, onBlur, value } }) => (
                            <GroupedInputItem
                              label={null}
                              placeholder={t('common.form.password.placeholder')}
                              nativeID="password"
                              value={value}
                              onChangeText={onChange}
                              autoComplete="new-password"
                              autoCapitalize="none"
                              onBlur={onBlur}
                              disabled={isLoading}
                              error={form.formState.errors.password?.message}
                              type="password"
                            />
                          )}
                        />
                        <Controller
                          name="confirm_password"
                          control={form.control}
                          render={({ field: { onChange, onBlur, value } }) => (
                            <GroupedInputItem
                              label={null}
                              placeholder={t('common.form.password.confirm.label')}
                              nativeID="confirm_password"
                              value={value}
                              onChangeText={onChange}
                              autoCapitalize="none"
                              onBlur={onBlur}
                              disabled={isLoading}
                              error={form.formState.errors.confirm_password?.message}
                              type="password"
                            />
                          )}
                        />
                      </GroupedInput>
                      {/* SUBMIT BUTTON */}
                      <Button
                        onPress={form.handleSubmit(handleSubmit)}
                        loading={isLoading}
                        style={tw.style('w-full rounded-xl')}
                      >
                        {upperFirst(t('common.messages.signup'))}
                      </Button>
                    </View>
                    <View style={[tw`w-full`, { gap: GAP }]}>
                      <Text style={tw`text-center`} textColor="muted">
                        {upperFirst(t('common.messages.or_continue_with'))}
                      </Text>
                      <OAuthProviders />
                    </View>
                    {/* SIGNUP */}
                    <Text style={[{ color: colors.mutedForeground }, tw.style('text-right')]}>
                      {t('pages.auth.signup.return_to_login')}{' '}
                      <Link href={'/auth/login'} replace style={{ color: colors.accentYellow }}>
                        {upperFirst(t('common.messages.login'))}
                      </Link>
                    </Text>
                  </>
                );
              case STEPS.EMAIL_VERIFICATION:
                return (
                  <View style={tw`flex-1 justify-center items-center gap-2`}>
                    <Icons.Mail color={colors.foreground} size={64} />
                    {isVerified === true ? (
                      <Text variant="title" style={tw`text-center mb-2`}>
                        {t('common.messages.email_confirmed')}
                      </Text>
                    ) : (
                      <>
                        <View>
                          <Text variant="title" style={tw`text-center`}>
                            {t('pages.auth.signup.confirm_form.label')}
                          </Text>
                          <Text textColor="muted" style={tw`text-center`}>
                            {t('pages.auth.signup.confirm_form.description', {
                              email: formGetValues('email'),
                            })}
                          </Text>
                        </View>
                        <Button variant="outline" onPress={handleResendOtp} loading={isLoading}>
                          {t('common.form.resend_email')}
                        </Button>
                      </>
                    )}
                  </View>
                );
              default:
                return null;
            }
          })()}
        </KeyboardAwareScrollView>
        <KeyboardToolbar />
      </LinearGradient>
    </>
  );
};

export default SignupScreen;
