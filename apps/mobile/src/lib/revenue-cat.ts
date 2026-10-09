import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import * as env from '../env';

export const REVENUECAT_API_KEY = Platform.select({
  ios: env.REVENUECAT_IOS_API_KEY,
  android: env.REVENUECAT_ANDROID_API_KEY,
});

let revenueCatInitialized: Promise<void> | null = null;
export const initializeRevenueCat = () => {
  if (!revenueCatInitialized) {
    revenueCatInitialized = (async () => {
      if (!REVENUECAT_API_KEY) throw new Error('RevenueCat API key missing');
      if (__DEV__) Purchases.setLogLevel(LOG_LEVEL.VERBOSE);
      await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
    })();
  }
  return revenueCatInitialized;
};
