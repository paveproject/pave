import { useCallback, useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack, useRouter } from 'expo-router';
import tw from '../../../lib/tw';
import { useTheme } from '../../../providers/ThemeProvider';
import { Input } from '../../../components/ui/Input';
import { upperFirst } from 'lodash';
import { Icons } from '../../../constants/Icons';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Text } from '../../../components/ui/text';
import { View } from '../../../components/ui/view';
import { useToast } from '../../../components/Toast';
import { logger } from '../../../logger';
import { LoopCarousel } from '../../../components/ui/LoopCarousel';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { uiBackgroundsOptions } from '../../../api/ui/uiOptions';
import { authClient } from '../../../lib/auth/client';
import { makeRedirectUri } from 'expo-auth-session';
import { MultiStepScreen } from '../../../components/ui/MultistepScreen';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useModalHeaderOptions } from '../../../hooks/useModalHeaderOptions';

enum STEPS {
  EMAIL = 1,
  EMAIL_VERIFICATION = 2,
}

const ForgotPasswordScreen = () => {
  const { colors } = useTheme();
  const toast = useToast();
  const t = useTranslations();
  const headerHeight = useHeaderHeight();
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const modalHeaderOptions = useModalHeaderOptions();

  const [currentStep, setCurrentStep] = useState(STEPS.EMAIL);

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
  const form = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: defaultValues,
    mode: 'onSubmit',
  });
  /* -------------------------------------------------------------------------- */

  // Handlers
  const handleSubmit = useCallback(
    async (data: ForgotPasswordFormValues) => {
      try {
        setIsLoading(true);
        const { error } = await authClient.requestPasswordReset({
          email: data.email,
          redirectTo: makeRedirectUri({
            path: '/auth/reset-password',
          }),
        });
        if (error) {
          switch (error.code) {
            default:
              toast.error(t('common.messages.an_error_occurred'));
              logger.error('Forgot password error', error);
              break;
          }
          throw error;
        }
        toast.success(upperFirst(t('common.form.code_sent')));
        setCurrentStep(STEPS.EMAIL_VERIFICATION);
      } finally {
        setIsLoading(false);
      }
    },
    [authClient, t, toast, logger],
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
          onNext={
            currentStep === STEPS.EMAIL_VERIFICATION
              ? handleFinish
              : form.handleSubmit(handleSubmit)
          }
          canGoBack={currentStep > STEPS.EMAIL && currentStep < STEPS.EMAIL_VERIFICATION}
          isLoading={isLoading}
          nextLabel={
            currentStep === STEPS.EMAIL_VERIFICATION
              ? t('common.messages.finish')
              : t('common.messages.continue')
          }
          nextIcon={currentStep === STEPS.EMAIL_VERIFICATION ? Icons.Check : Icons.ChevronRight}
          contentContainerStyle={{
            justifyContent: 'flex-end',
          }}
        >
          {(() => {
            switch (currentStep) {
              case STEPS.EMAIL:
                return (
                  <>
                    <Controller
                      name="email"
                      control={form.control}
                      render={({ field: { onChange, onBlur, value } }) => (
                        <Input
                          icon={Icons.Mail}
                          placeholder={t('common.form.email.label')}
                          autoFocus
                          nativeID="email"
                          inputMode="email"
                          autoComplete="email"
                          autoCapitalize="none"
                          value={value}
                          onChangeText={onChange}
                          disabled={isLoading}
                          keyboardType="email-address"
                          onBlur={onBlur}
                          error={form.formState.errors.email?.message}
                        />
                      )}
                    />
                  </>
                );

              case STEPS.EMAIL_VERIFICATION:
                return (
                  <View style={tw`flex-grow justify-center items-center`}>
                    <Icons.Mail color={colors.foreground} size={64} />
                    <Text variant="title" style={tw`text-center mb-2`}>
                      {t('common.messages.confirmation_email_sent')}
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

export default ForgotPasswordScreen;
