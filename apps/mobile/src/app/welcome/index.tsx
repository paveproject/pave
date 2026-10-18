import { useMemo } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Stack, useRouter } from 'expo-router';
import { Host, Text as NativeText } from '@expo/ui';
import {
  buttonStyle,
  controlSize,
  foregroundStyle,
  frame,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { fillMaxWidth } from '@expo/ui/jetpack-compose/modifiers';
import { useTranslations } from 'use-intl';
import { useMeUpdateMutation } from '@libs/query-client';
import { useAuth } from '../../providers/AuthProvider';
import { useTheme } from '../../providers/ThemeProvider';
import { useToast } from '../../components/Toast';
import { Input } from '../../components/ui/Input';
import { FormFieldError } from '../../components/ui/FormFieldError';
import { StatusBubble } from '../../components/ui/StatusBubble';
import { NativeButton } from '../../components/ui/NativeButton';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { logger } from '../../logger';
import { Icons as LegacyIcons } from '../../constants/IconsOld';
import { useModalHeaderOptions } from '../../hooks/useModalHeaderOptions';
import { usernameSchema, useUsernameAvailabilityCheck } from '../../hooks/useUsernameValidation';
import { useWelcomeFinish } from './_layout';

/**
 * One-time, skippable step after signup: every OTP sign-in gets a
 * generated gamertag-style username (see `GenerateUsernameHook`) up
 * front, so this just shows it and lets the user keep it or rename it -
 * unlike the old mandatory `auth/complete`, there's nothing to block on.
 * Dismissing any other way (the header cross, swipe, back) still finishes
 * the flow - see `WelcomeLayout`'s own unmount cleanup.
 */
const WelcomeScreen = () => {
  const t = useTranslations();
  const router = useRouter();
  const { colors, theme } = useTheme();
  const toast = useToast();
  const { user } = useAuth();
  const finish = useWelcomeFinish();
  const modalHeaderOptions = useModalHeaderOptions({ forceCross: true });

  const schema = useMemo(() => z.object({ username: usernameSchema(t) }), [t]);
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: user?.username ?? '' },
    mode: 'onChange',
  });

  const username = form.watch('username');
  const { isUsernameChecking, isUsernameAvailable } = useUsernameAvailabilityCheck(
    form,
    user?.username,
  );
  const { mutateAsync: updateMe, isPending: isSaving } = useMeUpdateMutation();

  const usernameChanged = username !== (user?.username ?? '');
  const usernameError =
    form.formState.errors.username?.message ??
    (isUsernameAvailable === false ? t('messages.username_unavailable') : undefined);

  const canContinue =
    !isSaving && !isUsernameChecking && form.formState.isValid && isUsernameAvailable !== false;

  const handleContinue = form.handleSubmit(async (values) => {
    try {
      if (usernameChanged) {
        await updateMe({ username: values.username });
      }
      await finish();
      router.back();
    } catch (error) {
      toast.error(t('messages.an_error_occurred'));
      logger.error('welcome save error', { error });
    }
  });

  const continueIosModifiers = [
    buttonStyle('glassProminent'),
    controlSize('extraLarge'),
    tint(colors.secondary),
    foregroundStyle(colors.secondaryForeground),
  ];
  const continueLabelModifiers =
    Platform.OS === 'ios' ? [frame({ maxWidth: Infinity })] : [fillMaxWidth()];

  return (
    <>
      <Stack.Screen options={modalHeaderOptions} />
      <View
        style={{
          flex: 1,
          gap: theme.spaces.md,
          paddingTop: theme.spaces.vertical,
          paddingHorizontal: theme.spaces.horizontal,
        }}
      >
        <View style={{ gap: theme.spaces.sm }}>
          <Text variant="title">{t('messages.welcome')}</Text>
          <Text textColor="muted">{t('pages.welcome.description')}</Text>
        </View>

        <Controller
          name="username"
          control={form.control}
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              nativeID="username"
              placeholder={t('messages.username')}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              disabled={isSaving}
              rightComponent={
                isUsernameChecking ? (
                  <ActivityIndicator />
                ) : isUsernameAvailable === true ? (
                  <StatusBubble
                    color={colors.success}
                    iconColor={colors.successForeground}
                    icon={LegacyIcons.Check}
                  />
                ) : undefined
              }
            />
          )}
        />
        <FormFieldError message={usernameError} />

        <Host style={{ width: '100%' }} matchContents={{ vertical: true }}>
          <NativeButton
            disabled={!canContinue}
            onPress={handleContinue}
            colors={{
              containerColor: colors.secondary,
              contentColor: colors.secondaryForeground,
            }}
            iosModifiers={continueIosModifiers}
            androidModifiers={[fillMaxWidth()]}
          >
            <NativeText
              textStyle={{ color: colors.secondaryForeground, textAlign: 'center' }}
              modifiers={continueLabelModifiers}
            >
              {t('messages.continue')}
            </NativeText>
          </NativeButton>
        </Host>
      </View>
    </>
  );
};

export default WelcomeScreen;
