import packageJson from '../../package.json';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

/**
 * The semver version of the app, as defined in `package.json.`
 *
 * N.B. The fallback is needed for Render.com deployments
 */
export const RELEASE_VERSION: string =
  process.env.EXPO_PUBLIC_RELEASE_VERSION ||
  Platform.select({
    ios: Constants.expoConfig?.ios?.buildNumber,
    android: Constants.expoConfig?.android?.version?.toString(),
    web: packageJson.version,
  }) ||
  packageJson.version;

/**
 * The env the app is running in e.g. development, testflight, production, e2e
 */
export const ENV = process.env.EXPO_PUBLIC_ENV!;

/**
 * Indicates whether the app is running in TestFlight
 */
export const IS_TESTFLIGHT = ENV === 'testflight';

/**
 * Indicates whether the app is __DEV__
 */
export const IS_DEV = __DEV__;

/**
 * Indicates whether the app is __DEV__ or TestFlight
 */
export const IS_INTERNAL = IS_DEV || IS_TESTFLIGHT;

/**
 * The commit hash that the current bundle was made from. The user can
 * see the commit hash in the app's settings along with the other version info.
 * Useful for debugging/reporting.
 */
// export const BUNDLE_IDENTIFIER: string =
//   process.env.EXPO_PUBLIC_BUNDLE_IDENTIFIER || 'dev'
export const BUNDLE_IDENTIFIER =
  Platform.select({
    ios: Constants.expoConfig?.ios?.bundleIdentifier,
    android: Constants.expoConfig?.android?.package,
    web: 'web',
  }) || 'unknown';

/**
 * This will always be in the format of YYMMDDHH, so that it always increases
 * for each build. This should only be used for StatSig reporting and shouldn't
 * be used to identify a specific bundle.
 */
export const BUNDLE_DATE: number =
  process.env.EXPO_PUBLIC_BUNDLE_DATE === undefined
    ? 0
    : Number(process.env.EXPO_PUBLIC_BUNDLE_DATE);

/**
 * The log level for the app.
 */
export const LOG_LEVEL = (process.env.EXPO_PUBLIC_LOG_LEVEL || 'info') as
  | 'debug'
  | 'info'
  | 'warn'
  | 'error';

/**
 * Enable debug logs for specific logger instances
 */
export const LOG_DEBUG: string = process.env.EXPO_PUBLIC_LOG_DEBUG || '';

export const DOMAIN_NAME: string = process.env.EXPO_PUBLIC_WEB_APP!;

/**
 * API
 */
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL!;
export const API_ENDPOINT = `${API_URL}/v1`;

const schemeFromConfig = Constants.expoConfig?.scheme;
export const SCHEME: string = Array.isArray(schemeFromConfig)
  ? schemeFromConfig[0]
  : schemeFromConfig || 'woodn';

/**
 * Sentry DSN for telemetry
 */
export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

/**
 * Facebook
 */
export const FACEBOOK_APP_ID = process.env.EXPO_PUBLIC_FACEBOOK_APP_ID!;

/**
 * RevenueCat
 */
export const REVENUECAT_IOS_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY!;
export const REVENUECAT_ANDROID_API_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY!;

/**
 * Google
 */
export const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID!;
export const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID!;

/**
 * Novu
 */
export const NOVU_APPLICATION_IDENTIFIER = process.env.EXPO_PUBLIC_NOVU_APPLICATION_IDENTIFIER!;

/**
 * Firebase
 */
export const FIREBASE_DEBUG_TOKEN_ANDROID = process.env.EXPO_PUBLIC_FIREBASE_DEBUG_TOKEN_ANDROID!;
export const FIREBASE_DEBUG_TOKEN_IOS = process.env.EXPO_PUBLIC_FIREBASE_DEBUG_TOKEN_IOS!;

/**
 * TMDB
 */
export const TMDB_IMAGE_BASE_URL = (
  process.env.EXPO_PUBLIC_TMDB_IMAGE_BASE_URL || 'https://image.tmdb.org/t/p'
).replace(/\/+$/, '');
