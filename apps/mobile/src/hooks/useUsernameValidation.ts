import * as z from 'zod';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import type { FieldValues, Path, UseFormReturn } from 'react-hook-form';
import { usernameAvailableOptions } from '@libs/query-client';
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
    .min(USERNAME_MIN, { message: t('messages.min_count_characters', { count: USERNAME_MIN }) })
    .max(USERNAME_MAX, { message: t('messages.max_count_characters', { count: USERNAME_MAX }) })
    .regex(/^[a-zA-Z0-9_.]+$/, { message: t('messages.username_format') });

/**
 * Debounces the form's `username` field and checks it against the server
 * once it clears local format validation.
 *
 * Deliberately does NOT inject the "unavailable" result into react-hook-
 * form's own `errors.username` via `setError`: this form uses `mode:
 * 'onChange'` with a zod `resolver`, which re-validates (and so
 * re-generates, replacing it) that field's error on every subsequent
 * change - a manually-set error for a field the resolver also owns gets
 * silently wiped the moment anything else triggers revalidation, often
 * before it's even visible. Callers combine `isUsernameAvailable` with
 * their own format-error message instead (see `useSettingsAccountForm`).
 */
export const useUsernameAvailabilityCheck = <T extends FieldValues & { username: string }>(
  form: UseFormReturn<T>,
  currentUsername?: string | null,
) => {
  const username = form.watch('username' as Path<T>) as string;
  const usernameToCheck = useDebounce(username, 500);

  const hasFormatError = !!form.formState.errors.username;
  const isEligible = (value: string) =>
    !hasFormatError && !!value && value !== (currentUsername ?? '');

  // Whether the field, exactly as typed *right now*, would get checked at
  // all - drives the loading indicator. Using the debounced value here
  // instead would mean it stays lagging/empty for the first 500ms of
  // every typing burst, so the indicator (and the debounce-pending state
  // below) would never show up *during* that wait, only once the
  // debounce has already caught up - i.e. right as typing stops, not
  // while it's happening.
  const isCurrentlyEligible = isEligible(username);
  const canCheck = isEligible(usernameToCheck);

  const { data: isUsernameAvailable, isFetching } = useQuery(
    usernameAvailableOptions(canCheck ? usernameToCheck : undefined),
  );

  const isDebouncePending = isCurrentlyEligible && username !== usernameToCheck;
  const isUsernameChecking = isCurrentlyEligible && (isDebouncePending || isFetching);

  return {
    isUsernameChecking,
    // `undefined` whenever a result wouldn't be meaningful (checking,
    // not applicable) - never a stale leftover from a previous value.
    isUsernameAvailable: canCheck && !isUsernameChecking ? isUsernameAvailable : undefined,
  };
};
