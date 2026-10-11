import { API_ENDPOINT } from '../../env';
import { client } from '@libs/api-js';
import { getSessionToken } from '../auth/session';
import { MOBILE_APP_HEADERS } from './app-version';

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
  for (const [name, value] of Object.entries(MOBILE_APP_HEADERS)) {
    config.headers.set(name, value);
  }
  return config;
});
