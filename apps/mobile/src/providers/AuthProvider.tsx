import { createContext, use, useCallback, useEffect, useState } from 'react';
import { useSplashScreen } from './SplashScreenProvider';
import { useLocaleContext } from './LocaleProvider';
import { useRevenueCat } from '../hooks/useRevenueCat';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MeResponse, client } from '@libs/api-js';
import { meKeys, meOptions } from '@libs/query-client';
import { defaultSupportedLocale, SupportedLocale, supportedLocales } from '@libs/i18n';
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
  // Keeps the RevenueCat SDK's identified user in sync as a side effect -
  // nothing here currently reads its returned customerInfo.
  useRevenueCat(user);

  const setSession = useCallback(
    async (token: string) => {
      // A request fired just before sign-in (e.g. the unauthenticated `/me`
      // probe) can still be in flight with no token attached. If it resolves
      // after the reset below, it writes a stale "logged out" result back
      // into the cache and the UI bounces back - cancel it first so only the
      // fresh, authenticated fetch can land.
      await queryClient.cancelQueries();
      await setSessionToken(token);
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
    queryClient.setQueryData(meKeys.details(), null);
    await queryClient.resetQueries();
  }, [queryClient]);

  useEffect(() => {
    if (!user?.language) return;
    setLocale(
      supportedLocales.includes(user.language as SupportedLocale)
        ? (user.language as SupportedLocale)
        : defaultSupportedLocale,
    );
    // Only re-run when the account's stored language actually changes - not
    // on every `setLocale` identity change, which happens on every manual
    // locale switch (its `useCallback` depends on `locale`) and would
    // otherwise immediately re-apply the account's language, undoing the
    // user's own in-app pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
