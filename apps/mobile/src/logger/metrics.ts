export type MetricEvents = {
  // App events
  init: {
    initMs: number;
  };
  'account:loggedIn': {
    logContext: 'AuthScreen';
  };
  'account:loginFailed': {
    logContext: 'AuthScreen';
    reason: string;
  };
  'account:loggedOut': {
    logContext: 'Settings' | 'Drawer';
  };
};
