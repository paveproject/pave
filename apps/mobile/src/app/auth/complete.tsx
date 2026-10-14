import { useMemo } from 'react';
import { ActivityIndicator, Platform } from 'react-native';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useRouter } from 'expo-router';
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
import { usernameSchema, useUsernameAvailabilityCheck } from '../../hooks/useUsernameValidation';

/**
 * Mandatory, non-dismissible step: OTP sign-in creates a user with no
 * username at all (see `libs/auth/src/otp.rs`), so the root layout forces
 * this screen open the moment it sees `user && !user.username` - no cross
 * button, no swipe-to-dismiss (see `app/_layout.tsx`'s `gestureEnabled:
 * false`), the only way out is successfully saving a username.
 */
const CompleteProfileScreen = () => {
  const t = useTranslations();
  const router = useRouter();
  const { colors, theme } = useTheme();
  const toast = useToast();

  const schema = useMemo(() => z.object({ username: usernameSchema(t) }), [t]);
  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { username: '' },
    mode: 'onChange',
  });

  const { isUsernameChecking, isUsernameAvailable } = useUsernameAvailabilityCheck(form, null);
  const { mutateAsync: updateMe, isPending: isSaving } = useMeUpdateMutation();

  // Same combination as `useSettingsAccountForm` - availability lives
  // outside RHF's own error state (see `useUsernameAvailabilityCheck`),
  // so it's merged with the format error here instead.
  const usernameError =
    form.formState.errors.username?.message ??
    (isUsernameAvailable === false ? t('messages.username_unavailable') : undefined);

  const canSave =
    !isSaving && !isUsernameChecking && form.formState.isValid && isUsernameAvailable !== false;

  const handleSave = form.handleSubmit(async (values) => {
    try {
      await updateMe({ username: values.username });
      router.back();
    } catch (error) {
      toast.error(t('messages.an_error_occurred'));
      logger.error('complete profile error', { error });
    }
  });

  const saveIosModifiers = [
    buttonStyle('glassProminent'),
    controlSize('extraLarge'),
    tint(colors.secondary),
    foregroundStyle(colors.secondaryForeground),
  ];
  const saveLabelModifiers =
    Platform.OS === 'ios' ? [frame({ maxWidth: Infinity })] : [fillMaxWidth()];

  return (
    <View
      style={{
        flex: 1,
        gap: theme.spaces.md,
        paddingTop: theme.spaces.vertical,
        paddingHorizontal: theme.spaces.horizontal,
      }}
    >
      <View style={{ gap: theme.spaces.sm }}>
        <Text variant="title">{t('messages.choose_a_username')}</Text>
        <Text textColor="muted">{t('pages.auth.complete.description')}</Text>
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
          disabled={!canSave || isSaving}
          onPress={handleSave}
          colors={{
            containerColor: colors.secondary,
            contentColor: colors.secondaryForeground,
          }}
          iosModifiers={saveIosModifiers}
          androidModifiers={[fillMaxWidth()]}
        >
          <NativeText
            textStyle={{ color: colors.secondaryForeground, textAlign: 'center' }}
            modifiers={saveLabelModifiers}
          >
            {t('messages.continue')}
          </NativeText>
        </NativeButton>
      </Host>
    </View>
  );
};

export default CompleteProfileScreen;
