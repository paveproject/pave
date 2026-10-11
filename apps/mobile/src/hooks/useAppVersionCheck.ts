import { useEffect, useRef } from 'react';
import { Alert, Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { MOBILE_APP_STORE_URL, systemStatusQueryOptions } from '../lib/api/app-version';
import { useTheme } from '../providers/ThemeProvider';

/**
 * Best-effort only: offline-first means this must never block app startup
 * or surface an error if the request fails (no connectivity, API down,
 * etc.) - it either silently finds nothing to say, or shows a dismissible
 * native alert. Not persisted - re-checks and re-shows on every cold start
 * by design (not nagging mid-session).
 *
 * Only reacts to `update_required` (the version comparison itself happens
 * server-side, see `apps/api/src/app/system/version_rules.rs`) -
 * `update_available` is a soft nudge Pave has no UI for yet (no toast
 * system, unlike Recomend's `useUpdateAvailableGate`); `isMaintenance` is
 * returned by `/status` too but not acted on anywhere yet either.
 */
export const useAppVersionCheck = () => {
  const t = useTranslations();
  const { mode } = useTheme();
  const alreadyShown = useRef(false);
  const { data } = useQuery(systemStatusQueryOptions());

  useEffect(() => {
    if (!data || alreadyShown.current) return;
    if (data.version.status !== 'update_required') return;

    alreadyShown.current = true;
    const storeUrl = MOBILE_APP_STORE_URL;
    const buttons = storeUrl
      ? [
          { text: t('messages.later'), style: 'cancel' as const },
          { text: t('messages.update_now'), onPress: () => Linking.openURL(storeUrl) },
        ]
      : [{ text: t('messages.ok') }];

    Alert.alert(
      t('messages.update_available_title'),
      t('messages.update_available_message'),
      buttons,
      {
        userInterfaceStyle: mode,
      },
    );
  }, [data, t, mode]);
};
