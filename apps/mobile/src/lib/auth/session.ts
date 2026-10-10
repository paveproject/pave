import * as SecureStore from 'expo-secure-store';

// The raw session token from `/auth/otp/verify`, presented as
// `Authorization: Bearer <token>` on every later request - the API has no
// browser cookie jar to rely on for a native client (see apps/api/src/main.rs's
// `BearerConfig`).
const SESSION_TOKEN_KEY = 'pave_session_token';

export const getSessionToken = (): Promise<string | null> => {
  return SecureStore.getItemAsync(SESSION_TOKEN_KEY);
};

export const setSessionToken = (token: string): Promise<void> => {
  return SecureStore.setItemAsync(SESSION_TOKEN_KEY, token);
};

export const clearSessionToken = (): Promise<void> => {
  return SecureStore.deleteItemAsync(SESSION_TOKEN_KEY);
};
