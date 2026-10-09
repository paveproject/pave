import { SocialProvider } from 'better-auth/types';

export type MetricEvents = {
  // App events
  init: {
    initMs: number;
  };
  'account:loggedIn': {
    logContext: 'LoginForm' | 'LoginOtpScreen' | 'SignupForm';
    withPassword: boolean;
  };
  'account:loginFailed': {
    logContext: 'LoginForm' | 'LoginOtpScreen';
    reason: string;
  };
  'account:signupFailed': {
    logContext: 'SignupForm' | 'SignupOtpScreen';
    reason: string;
  };
  'account:loggedInWithOAuth': {
    logContext: 'LoginForm' | 'SignupForm';
    provider: SocialProvider;
  };
  'account:forgotPasswordFailed': {
    logContext: 'ForgotPasswordScreen' | 'ForgotPasswordOtpScreen';
    reason: string;
  };
  'account:loggedOut': {
    logContext: 'Settings' | 'Drawer';
  };
};
