import { useEffect, useMemo } from 'react';
import { useRouter } from 'expo-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useTranslations } from 'use-intl';
import { useMeUpdateMutation, useSendChangeEmailOtpMutation } from '@libs/query-client';
import { useAuth } from '../providers/AuthProvider';
import { useLocaleContext } from '../providers/LocaleProvider';
import { useToast } from '../components/Toast';
import { logger } from '../logger';
import { usernameSchema, useUsernameAvailabilityCheck } from '../hooks/useUsernameValidation';

/**
 * Shared across the iOS and Android `SettingsAccount` screens - validation,
 * debounced username availability, and the save/change-email flow are
 * identical on both platforms. Only the input rendering diverges (raw
 * SwiftUI `TextField` vs the universal `TextInput`), which is why this is a
 * plain hook rather than a shared component.
 */
export const useSettingsAccountForm = () => {
  const t = useTranslations();
  const router = useRouter();
  const { user } = useAuth();
  const { locale } = useLocaleContext();
  const toast = useToast();

  const accountFormSchema = useMemo(
    () =>
      z.object({
        username: usernameSchema(t),
        email: z.email({ message: t('messages.invalid_email') }),
      }),
    [t],
  );
  type AccountFormValues = z.infer<typeof accountFormSchema>;

  const defaultValues = useMemo(
    (): AccountFormValues => ({
      username: user?.username ?? '',
      email: user?.email ?? '',
    }),
    [user],
  );

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountFormSchema),
    defaultValues,
    mode: 'onChange',
  });

  useEffect(() => {
    form.reset(defaultValues);
    // `form` is included for exhaustive-deps correctness only - react-hook-
    // form returns a stable instance, so this still only re-runs when the
    // account's own values actually change.
  }, [defaultValues, form]);

  const username = form.watch('username');
  const email = form.watch('email');
  const { isUsernameChecking, isUsernameAvailable } = useUsernameAvailabilityCheck(
    form,
    user?.username,
  );

  // The availability check lives outside RHF's own error state (see
  // `useUsernameAvailabilityCheck`), so it's combined with the format
  // error here rather than read back off `form.formState.errors`.
  const usernameError =
    form.formState.errors.username?.message ??
    (isUsernameAvailable === false ? t('messages.username_unavailable') : undefined);

  const { mutateAsync: updateMe, isPending: isSavingUsername } = useMeUpdateMutation();
  const { mutateAsync: sendChangeEmailOtp, isPending: isSendingCode } =
    useSendChangeEmailOtpMutation();
  const isSaving = isSavingUsername || isSendingCode;

  const usernameChanged = username !== (user?.username ?? '');
  const emailChanged = email !== (user?.email ?? '');
  const hasChanges = usernameChanged || emailChanged;
  const canSave =
    !isSaving &&
    !isUsernameChecking &&
    hasChanges &&
    form.formState.isValid &&
    isUsernameAvailable !== false;

  const handleSave = form.handleSubmit(async (values) => {
    try {
      if (usernameChanged) {
        await updateMe({ username: values.username });
        toast.success(t('messages.username_updated'));
      }
      if (emailChanged) {
        await sendChangeEmailOtp({ newEmail: values.email, lang: locale });
        router.push({
          pathname: '/settings/account/change-email',
          params: { newEmail: values.email },
        });
      }
    } catch (error) {
      toast.error(t('messages.an_error_occurred'));
      logger.error('account save error', { error });
    }
  });

  return {
    form,
    canSave,
    isSaving,
    isUsernameChecking,
    isUsernameAvailable,
    usernameError,
    handleSave,
  };
};
