import { createContext, use, useCallback, useEffect, useRef, useState } from 'react';
import { useSplashScreen } from './SplashScreenProvider';
import { useLocaleContext } from './LocaleProvider';
import { clearPersistedQueryCache } from './ReactQueryProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MeResponse, client } from '@libs/api-js';
import { meKeys, meOptions } from '@libs/query-client';
import { defaultSupportedLocale, SupportedLocale, supportedLocales } from '@libs/i18n';
import { useMeSyncStore } from '../stores/useMeSyncStore';
import { clearSessionToken, setSessionToken } from '../lib/auth/session';

type AuthContextProps = {
  user: MeResponse | null | undefined;
  setSession: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  pushToken: string | null;
  setPushToken: (token: string | null) => void;
};

type AuthProviderProps = {
  children: React.ReactNode;
};

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

const AuthProvider = ({ children }: AuthProviderProps) => {
  const { auth } = useSplashScreen();
  const queryClient = useQueryClient();
  const { setLocale } = useLocaleContext();
  const [pushToken, setPushToken] = useState<string | null>(null);
  const { data: user, status: userStatus } = useQuery(meOptions());

  const setSession = useCallback(
    async (token: string) => {
      // A request fired just before sign-in (e.g. the unauthenticated `/me`
      // probe) can still be in flight with no token attached. If it resolves
      // after the reset below, it writes a stale "logged out" result back
      // into the cache and the UI bounces back - cancel it first so only the
      // fresh, authenticated fetch can land.
      await queryClient.cancelQueries();
      await setSessionToken(token);
      // Not just the in-memory cache - the persisted MMKV blob (see
      // `clearPersistedQueryCache`'s own doc comment) can still carry
      // whichever account was last active on this device, since it isn't
      // actually scoped per-user today.
      clearPersistedQueryCache();
      await queryClient.resetQueries();
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await client.post({ url: '/auth/sign-out' });
    } catch {
      // Best-effort server-side revocation - clearing the local token below
      // is what actually ends the session on this device.
    }
    // Same race in reverse: a `/me` fetch already in flight with the still-
    // valid token can resolve after the token is cleared and the cache is
    // reset, re-writing the signed-in user back in - hence the brief flash
    // of the signed-out UI before it bounced back. Cancelling first, then
    // setting `/me` straight to `null`, removes the window for that.
    await queryClient.cancelQueries();
    await clearSessionToken();
    clearPersistedQueryCache();
    queryClient.setQueryData(meKeys.details(), null);
    await queryClient.resetQueries();
  }, [queryClient]);

  // `setLocale`'s own identity changes on every manual locale switch (its
  // `useCallback` depends on `locale`) - read it through a ref, kept fresh
  // here, so the effect below only needs to re-run when the account's
  // stored language actually changes, not on every such identity change
  // (which would otherwise immediately re-apply the account's language,
  // undoing the user's own in-app pick).
  const setLocaleRef = useRef(setLocale);
  useEffect(() => {
    setLocaleRef.current = setLocale;
  }, [setLocale]);

  useEffect(() => {
    if (!user?.language) return;
    // A local pick made while offline (or that otherwise failed to push,
    // see `useMeSync`) hasn't reached the account yet - `user.language`
    // here is stale in that case, not a change made elsewhere that this
    // device should adopt. Applying it would silently revert the user's
    // own still-unsynced pick. MMKV-backed, so this read is synchronous -
    // no need for the async check this used to be.
    if (useMeSyncStore.getState().pending.language) return;
    setLocaleRef.current(
      supportedLocales.includes(user.language as SupportedLocale)
        ? (user.language as SupportedLocale)
        : defaultSupportedLocale,
    );
  }, [user?.language]);

  useEffect(() => {
    // Fire on both success and error - a definitive "not logged in" must
    // unblock the splash screen just as much as a successful fetch does.
    if (userStatus === 'pending') return;
    auth.setReady(true);
  }, [userStatus, auth]);

  return (
    <AuthContext.Provider
      value={{
        user,
        setSession,
        logout,
        pushToken,
        setPushToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

const useAuth = () => {
  const context = use(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export { AuthProvider, useAuth };
