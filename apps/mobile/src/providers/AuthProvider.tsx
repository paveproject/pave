import { createContext, use, useCallback, useEffect, useRef, useState } from 'react';
import { useSplashScreen } from './SplashScreenProvider';
import { useLocaleContext } from './LocaleProvider';
import { clearPersistedQueryCache } from './ReactQueryProvider';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MeResponse, client } from '@libs/api-js';
import { meKeys, meOptions } from '@libs/query-client';
import { defaultSupportedLocale, SupportedLocale, supportedLocales } from '@libs/i18n';
import { useMeSyncStore } from '../stores/useMeSyncStore';
import { clearSessionToken, getSessionToken, setSessionToken } from '../lib/auth/session';
import { clearLocalReports } from '../lib/watermelon/reports';

type AuthContextProps = {
  user: MeResponse | null | undefined;
  setSession: (token: string, email: string) => Promise<void>;
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
    async (token: string, email: string) => {
      // A device whose session got revoked (e.g. a sibling recovered the
      // account via trusted contacts or the recovery phrase - see
      // `activate_via_recovery_key_mnemonic`) re-authenticates through this
      // exact same OTP flow once it's back online, for the SAME account -
      // not a second account signing in. Wiping local state below would
      // otherwise destroy whatever this device hadn't synced yet (draft
      // reports included) purely as a side effect of being forced to redo
      // OTP. The cached `/me` response (nothing clears it on a 401 - it
      // just goes stale) still identifies whichever account was last
      // active on this device, so comparing emails tells the two cases
      // apart before anything is touched.
      const previousEmail = queryClient.getQueryData<MeResponse>(meKeys.details())?.email;
      const isSameAccount = !!previousEmail && previousEmail.toLowerCase() === email.toLowerCase();

      // A request fired just before sign-in (e.g. the unauthenticated `/me`
      // probe) can still be in flight with no token attached. If it resolves
      // after the reset below, it writes a stale "logged out" result back
      // into the cache and the UI bounces back - cancel it first so only the
      // fresh, authenticated fetch can land.
      await queryClient.cancelQueries();
      await setSessionToken(token);

      if (!isSameAccount) {
        // Not just the in-memory cache - the persisted MMKV blob (see
        // `clearPersistedQueryCache`'s own doc comment) can still carry
        // whichever account was last active on this device, since it isn't
        // actually scoped per-user today. Same reasoning for WatermelonDB's
        // reports (see `clearLocalReports`'s own doc comment) and for
        // `useMeSyncStore`'s own pending `/me` field edits, which are no
        // less account-specific.
        clearPersistedQueryCache();
        await clearLocalReports();
        useMeSyncStore.setState({ pending: {} });
      }
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
    await clearLocalReports();
    useMeSyncStore.setState({ pending: {} });
    queryClient.setQueryData(meKeys.details(), null);
    await queryClient.resetQueries();
  }, [queryClient]);

  // A 401 means the server already revoked this device's session - a
  // sibling reclaimed the account via the recovery phrase or trusted
  // contacts (see `activate_via_recovery_key_mnemonic`/
  // `create_recovery_request`), or another device explicitly removed this
  // one. There's no realtime event for "you've been suspended" (the
  // websocket connection dies with the session anyway, before it could
  // ever deliver one), so a 401 on the very next API call is the one
  // reliable signal - without this, the app would keep showing stale
  // cached data as if nothing happened indefinitely.
  const handlingRevokedSession = useRef(false);
  useEffect(() => {
    const onResponse = async (response: Response) => {
      if (response.status !== 401) return response;

      // The unauthenticated `/me` probe fired before any sign-in also
      // 401s - that's expected, not a revoked session. Only react if this
      // device actually believed it had one.
      const token = await getSessionToken();
      if (!token || handlingRevokedSession.current) return response;
      handlingRevokedSession.current = true;

      try {
        // Deliberately NOT `clearLocalReports`/`clearPersistedQueryCache` -
        // this is still the same account's device, only locked out, not a
        // different account signing in (see `setSession`'s own "same
        // account" guard for the identical reasoning). Whatever's unsynced
        // stays safe for whenever this device is approved again.
        await queryClient.cancelQueries();
        await clearSessionToken();
        queryClient.setQueryData(meKeys.details(), null);
        await queryClient.resetQueries();
      } finally {
        handlingRevokedSession.current = false;
      }

      return response;
    };

    client.interceptors.response.use(onResponse);
    return () => client.interceptors.response.eject(onResponse);
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
