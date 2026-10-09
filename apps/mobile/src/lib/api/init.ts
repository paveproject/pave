import { API_ENDPOINT, API_URL } from '../../env';
import { client, realtime } from '@libs/api-js';
import { authClient } from '../auth/client';

client.setConfig({
  baseUrl: API_ENDPOINT || 'https://api.pave.app/v1',
  credentials: 'include',
});

client.interceptors.request.use(async (config) => {
  const cookie = await authClient.getCookie();
  if (cookie) {
    config.headers.set('Cookie', cookie);
  }
  return config;
});

realtime.setConfig({
  baseUrl: API_URL || 'https://api.pave.app',
  getAuthCookie: async () => {
    const token = await authClient.getCookie();
    return token;
  },
});
