import { View } from '../../../components/ui/view';
import { Icons } from '../../../constants/Icons';
import tw from '../../../lib/tw';
import { useCallback, useMemo, useState } from 'react';
import { Redirect, useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { useTranslations } from 'use-intl';
import { useToast } from '../../../components/Toast';
import { logger } from '../../../logger';
import { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { MultiStepScreen } from '../../../components/ui/MultistepScreen';
import { Text } from '../../../components/ui/text';
import { Input } from '../../../components/ui/Input';
import { authClient } from '../../../lib/auth/client';
import { useTheme } from '../../../providers/ThemeProvider';
import { LoopCarousel } from '../../../components/ui/LoopCarousel';
import { useQuery } from '@tanstack/react-query';
import { uiBackgroundsOptions } from '../../../api/ui/uiOptions';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useModalHeaderOptions } from '../../../hooks/useModalHeaderOptions';

const PASSWORD_MIN_LENGTH = 8;

enum STEPS {
  PASSWORD = 1,
  LOGIN = 2,
}

const AuthResetPasswordScreen = () => {
  const t = useTranslations();
  const toast = useToast();
  const router = useRouter();
  const { colors } = useTheme();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [isLoading, setIsLoading] = useState(false);
  const headerHeight = useHeaderHeight();
  const modalHeaderOptions = useModalHeaderOptions();

  // Queries
  const { data: backgrounds } = useQuery(uiBackgroundsOptions());

  /* ---------------------------------- Schema ---------------------------------- */
  const resetPasswordSchema = useMemo(
    () =>
      z
        .object({
          newPassword: z
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
          confirmPassword: z.string(),
        })
        .refine((data) => data.newPassword === data.confirmPassword, {
          message: t('common.form.password.schema.match'),
          path: ['confirm_password'],
        }),
    [t],
  );
  type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

  const form = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onChange',
  });

  /* ---------------------------------- Steps --------------------------------- */
  const [currentStep, setCurrentStep] = useState(STEPS.PASSWORD);

  /* -------------------------------- Handlers -------------------------------- */
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

  const handleSubmit = useCallback(
    async (data: ResetPasswordFormValues) => {
      try {
        setIsLoading(true);
        const { error } = await authClient.resetPassword({
          newPassword: data.newPassword,
          token: token,
        });
        if (error) {
          switch (error.code) {
            case 'INVALID_TOKEN':
              toast.error(t('common.messages.invalid_token'));
              break;
            default:
              toast.error(t('common.messages.an_error_occurred'));
              logger.error('Reset password error', error);
              break;
          }
          throw error;
        }
        setCurrentStep(STEPS.LOGIN);
      } finally {
        setIsLoading(false);
      }
    },
    [token, authClient, toast, t, logger],
  );

  if (!token) {
    return <Redirect href={{ pathname: '/auth/login' }} />;
  }

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
        style={{
          flexGrow: 1,
          paddingTop: headerHeight,
        }}
      >
        <MultiStepScreen
          currentStepKey={currentStep}
          onNext={currentStep === STEPS.LOGIN ? handleFinish : form.handleSubmit(handleSubmit)}
          canGoBack={currentStep > STEPS.PASSWORD && currentStep < STEPS.LOGIN}
          isLoading={isLoading}
          nextLabel={
            currentStep === STEPS.LOGIN
              ? t('common.messages.finish')
              : t('common.messages.continue')
          }
          nextIcon={currentStep === STEPS.LOGIN ? Icons.Check : Icons.ChevronRight}
          contentContainerStyle={{
            justifyContent: 'flex-end',
          }}
        >
          {(() => {
            switch (currentStep) {
              case STEPS.PASSWORD:
                return (
                  <>
                    <Controller
                      name="newPassword"
                      control={form.control}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <Input
                          placeholder={t('common.messages.new_password')}
                          autoFocus
                          nativeID="password"
                          value={value}
                          onChangeText={onChange}
                          autoComplete="new-password"
                          autoCapitalize="none"
                          onBlur={onBlur}
                          disabled={isLoading}
                          error={form.formState.errors.newPassword?.message}
                          type="password"
                        />
                      )}
                    />
                    <Controller
                      name="confirmPassword"
                      control={form.control}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <Input
                          placeholder={t('common.messages.confirm_password')}
                          nativeID="password"
                          value={value}
                          onChangeText={onChange}
                          autoComplete="new-password"
                          autoCapitalize="none"
                          onBlur={onBlur}
                          disabled={isLoading}
                          error={form.formState.errors.confirmPassword?.message}
                          type="password"
                        />
                      )}
                    />
                  </>
                );

              case STEPS.LOGIN:
                return (
                  <View style={tw`flex-1 justify-center items-center`}>
                    <Icons.Check color={colors.accentGreen} size={64} />
                    <Text variant="title" style={tw`text-center mb-2`}>
                      {t('common.messages.password_reseted')}
                    </Text>
                  </View>
                );

              default:
                return null;
            }
          })()}
        </MultiStepScreen>
      </LinearGradient>
    </>
  );
};

export default AuthResetPasswordScreen;
