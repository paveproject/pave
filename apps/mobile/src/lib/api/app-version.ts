import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { getStatusOptions } from '@libs/api-js';
import { BUNDLE_IDENTIFIER } from '../../env';

// apps/mobile/eas.json -> submit.production.ios.ascAppId is still a
// placeholder (no App Store listing yet) - fill this in once it exists.
// Not derivable at runtime (unlike the Android package name), so kept as a
// constant, same as Recomend's own MOBILE_APP_STORE_URL.
const IOS_APP_STORE_ID: string | null = null;

export const MOBILE_APP_STORE_URL: string | null =
  Platform.select({
    ios: IOS_APP_STORE_ID ? `itms-apps://apps.apple.com/app/id${IOS_APP_STORE_ID}` : undefined,
    android: `market://details?id=${BUNDLE_IDENTIFIER}`,
  }) ?? null;

/**
 * Sent on every API request by `lib/api/init.ts`. Nothing on the API side
 * enforces a minimum version from these (there's no equivalent of
 * Recomend's `AppVersionMiddleware` - the app is offline-first and must
 * keep working on an old version, never get hard-blocked mid-request), but
 * the API already has them available for logging/analytics if that's ever
 * needed, without a mobile release to add them later.
 *
 * Must stay in sync with `apps/api/src/app/system/headers.rs`'s
 * `APP_PLATFORM_HEADER`/`APP_VERSION_HEADER` - there's no shared lib across
 * the Rust/TS boundary to enforce that automatically.
 */
export const MOBILE_APP_HEADERS = {
  'x-app-platform': Platform.OS === 'ios' ? 'ios' : 'android',
  'x-app-version': Application.nativeApplicationVersion ?? '',
} as const;

/**
 * `GET /status`: maintenance mode + this app's version status in one round
 * trip, since the app sends its headers on every request anyway. Checked
 * once per cold start (see `useAppVersionCheck`), not on a poll/refetch
 * schedule - this is a dismissible nudge, not something that needs to
 * react mid-session.
 */
export const systemStatusQueryOptions = (): ReturnType<typeof getStatusOptions> => ({
  ...getStatusOptions(),
  retry: false,
  staleTime: Infinity,
});
