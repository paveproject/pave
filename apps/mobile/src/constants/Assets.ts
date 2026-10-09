import { Platform } from 'react-native';

export const Assets = {
  onboarding: {
    // example
    tracking: Platform.select({
      ios: 'onboarding_tracking_ios',
      // android: 'onboarding_tracking_android',
      default: 'onboarding_tracking_ios',
    }),
  },
};
