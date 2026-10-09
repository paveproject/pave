import { Provider } from '@nestjs/common';
import * as apn from '@parse/node-apn';
import { env } from '../../env';

export const APNS_CLIENT = 'APNS_CLIENT';

export const apnsProvider: Provider = {
  provide: APNS_CLIENT,
  useFactory: () => {
    return new apn.Provider({
      token: {
        key: env.APNS_KEY_B64,
        keyId: env.APNS_KEY_ID,
        teamId: env.APNS_TEAM_ID,
      },
      production: env.NODE_ENV === 'production',
    });
  },
};
