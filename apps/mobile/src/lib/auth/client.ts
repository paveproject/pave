import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import {
  emailOTPClient,
  inferAdditionalFields,
  magicLinkClient,
  usernameClient,
} from 'better-auth/client/plugins';
import { API_URL, SCHEME } from '../../env';
import * as SecureStore from 'expo-secure-store';
import type { auth } from '@libs/db';

export const authClient = createAuthClient({
  baseURL: API_URL,
  basePath: '/auth',
  plugins: [
    usernameClient(),
    magicLinkClient(),
    inferAdditionalFields<typeof auth>(),
    emailOTPClient(),
    expoClient({
      scheme: SCHEME,
      storagePrefix: SCHEME,
      // cookiePrefix: AUTH_COOKIE_PREFIX || SCHEME,
      storage: SecureStore,
    }),
  ],
});

export const { signIn, signUp, useSession, signOut } = authClient;
