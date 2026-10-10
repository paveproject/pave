import { useEffect } from 'react';
import * as z from 'zod';
import { useTranslations } from 'use-intl';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { useUsernameAvailability } from '@libs/query-client';
import useDebounce from './useDebounce';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

/**
 * Shared between every form with a `username` field (account settings,
 * mandatory profile completion) - the rules and the debounced
 * availability-check wiring must stay identical everywhere.
 */
export const usernameSchema = (t: ReturnType<typeof useTranslations>) =>
  z
    .string()
    .min(USERNAME_MIN, { message: t('form.username.schema.min', { count: USERNAME_MIN }) })
    .max(USERNAME_MAX, { message: t('form.username.schema.max', { count: USERNAME_MAX }) })
    .regex(/^[a-zA-Z0-9_.]+$/, { message: t('form.username.schema.format') });

/**
 * Debounces the form's `username` field and checks it against the server
 * once it clears local format validation, setting a manual RHF error when
 * it's already taken - same UX as a sign-in OTP error.
 */
export const useUsernameAvailabilityCheck = <T extends FieldValues & { username: string }>(
  form: UseFormReturn<T>,
  currentUsername?: string | null,
) => {
  const t = useTranslations();
  const username = form.watch('username' as Path<T>) as string;
  const usernameToCheck = useDebounce(username, 500);

  const { data: isUsernameAvailable, isFetching: isUsernameChecking } = useUsernameAvailability(
    !form.formState.errors.username &&
      usernameToCheck &&
      usernameToCheck !== (currentUsername ?? '')
      ? usernameToCheck
      : undefined,
  );

  useEffect(() => {
    if (isUsernameAvailable === false) {
      form.setError('username' as Path<T>, { message: t('form.username.schema.unavailable') });
    }
  }, [isUsernameAvailable, t, form]);

  return { isUsernameChecking };
};
