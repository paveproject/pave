import { API_ENDPOINT, API_URL } from '../../env';
import { client, realtime } from '@libs/api-js';
import { getSessionToken } from '../auth/session';

client.setConfig({
  baseUrl: API_ENDPOINT || 'https://api.pave.app',
  // Auth is Bearer-only here (see session.ts) - never let the native fetch
  // layer store or resend cookies for this client, so a stray `Set-Cookie`
  // from the API (now or in the future) can't linger and keep `/me`
  // authenticated after `clearSessionToken()` clears the real token.
  credentials: 'omit',
});

client.interceptors.request.use(async (config) => {
  const token = await getSessionToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

realtime.setConfig({
  baseUrl: API_URL || 'https://api.pave.app',
  getAuthCookie: async () => {
    return getSessionToken();
  },
});
