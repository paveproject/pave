import { Provider } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { env } from '../../env';

export const FCM_CLIENT = 'FCM_CLIENT';

export const fcmProvider: Provider = {
  provide: FCM_CLIENT,
  useFactory: () => {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY_B64,
        }),
      });
    }
    return admin.messaging();
  },
};
