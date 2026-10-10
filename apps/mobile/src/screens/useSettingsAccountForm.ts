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
        email: z.email({ message: t('form.email.error.invalid') }),
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
    // Only re-seed when the account's own values change, not on every
    // `form` identity change (react-hook-form returns a stable instance, but
    // being explicit here avoids re-running this on unrelated re-renders).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultValues]);

  const username = form.watch('username');
  const email = form.watch('email');
  const { isUsernameChecking } = useUsernameAvailabilityCheck(form, user?.username);

  const { mutateAsync: updateMe, isPending: isSavingUsername } = useMeUpdateMutation();
  const { mutateAsync: sendChangeEmailOtp, isPending: isSendingCode } =
    useSendChangeEmailOtpMutation();
  const isSaving = isSavingUsername || isSendingCode;

  const usernameChanged = username !== (user?.username ?? '');
  const emailChanged = email !== (user?.email ?? '');
  const hasChanges = usernameChanged || emailChanged;
  const canSave = !isSaving && !isUsernameChecking && hasChanges && form.formState.isValid;

  const handleSave = form.handleSubmit(async (values) => {
    try {
      if (usernameChanged) {
        await updateMe({ username: values.username });
        toast.success(t('pages.settings.account.username.updated'));
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
    handleSave,
  };
};
