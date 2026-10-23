import { useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { createMMKV } from 'react-native-mmkv';
import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager, QueryClient } from '@tanstack/react-query';
import {
  PersistQueryClientProvider,
  PersistQueryClientProviderProps,
} from '@tanstack/react-query-persist-client';
import { persistKey } from '../api';
import { meKeys, trustedContactsKeys } from '@libs/query-client';
// import { useReactQueryDevTools } from "@dev-plugins/react-query";

const queryStorage = createMMKV({
  id: 'react-query-cache',
});

/**
 * Wipes the persisted react-query cache from disk (not just the in-memory
 * `QueryClient`) - called from `AuthProvider`'s `setSession`/`logout`
 * alongside `queryClient.resetQueries()`.
 *
 * The in-memory reset alone isn't enough: `PERSISTED_QUERY_KEYS` below
 * (trusted contacts, `/me`) survive to disk specifically so the recovery-
 * key bootstrap has something to read on a cold start, before the first
 * refetch lands - but every account currently shares the *same* on-disk
 * key (`queryClient-anonymous`, since `ReactQueryProvider` is never
 * actually given a `userId` to scope it by - it can't be, sitting above
 * `AuthProvider` in the tree). Without this, a stale blob from whichever
 * account was last active can rehydrate as if it belonged to whoever logs
 * in next on the same device, "fresh" for the rest of `staleTime` -
 * exactly how a trusted-contact upload ended up carrying a *different*
 * account's relationship ids. Clearing on every session transition closes
 * that regardless of which account was there before.
 */
export const clearPersistedQueryCache = () => {
  queryStorage.clearAll();
};

const createMMKVPersister = (key: string) => ({
  persistClient: async (client: any) => {
    try {
      queryStorage.set(key, JSON.stringify(client));
    } catch (error) {
      console.error('Failed to persist query client:', error);
    }
  },
  restoreClient: async () => {
    try {
      const stored = queryStorage.getString(key);
      return stored ? JSON.parse(stored) : undefined;
    } catch (error) {
      console.error('Failed to restore query client:', error);
      return undefined;
    }
  },
  removeClient: async () => {
    try {
      queryStorage.remove(key);
    } catch (error) {
      console.error('Failed to remove query client:', error);
    }
  },
});

// `trustedContactsKeys.base` is here so the "mine"/"as-contact" lists
// survive a cold start, same reasoning as `meKeys.base` - the recovery-key
// bootstrap (see `Providers.tsx`'s `RecoveryKeyBootstrap`) and its debug
// screen both read off these on launch, before the first refetch lands.
const PERSISTED_QUERY_KEYS = [meKeys.base, trustedContactsKeys.base, persistKey];

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        retry: false,
        staleTime: 5 * 60 * 1000,
        gcTime: 10 * 60 * 1000,
      },
      // Every `useMutation` call gets this for free: a transient failure
      // (server blip, timeout) retries with backoff instead of just
      // failing once. Doesn't cover offline - that's `onlineManager`
      // below, which pauses a mutation instead of even attempting it.
      mutations: {
        retry: 3,
        retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 30_000),
      },
    },
  });

const dehydrateOptions: PersistQueryClientProviderProps['persistOptions']['dehydrateOptions'] = {
  shouldDehydrateMutation: () => false,
  shouldDehydrateQuery: (query) => {
    return PERSISTED_QUERY_KEYS.some((key) => String(query.queryKey[0]).startsWith(key));
  },
};

focusManager.setEventListener((onFocus) => {
  const subscription = AppState.addEventListener('change', (status: AppStateStatus) => {
    focusManager.setFocused(status === 'active');
  });

  return () => subscription.remove();
});

// Without this, `onlineManager` has no event source on React Native and
// defaults to "always online" - every mutation would just attempt and
// fail while offline instead of pausing and auto-resuming on reconnect.
// `providers/sync/networkStatus.ts` reads this same signal, so
// `useSyncTask`'s retry-on-reconnect trigger and every `useMutation`'s
// pause/resume share one connectivity source instead of two independent
// `NetInfo` listeners.
onlineManager.setEventListener((setOnline) => {
  const subscription = NetInfo.addEventListener((state) => {
    setOnline(!!state.isConnected && state.isInternetReachable !== false);
  });

  return () => subscription.remove();
});

type ReactQueryProviderProps = {
  children: React.ReactNode;
  userId?: string;
};

export function ReactQueryProvider({ children, userId }: ReactQueryProviderProps) {
  return (
    <QueryProviderInner key={userId} userId={userId}>
      {children}
    </QueryProviderInner>
  );
}

function QueryProviderInner({ children, userId }: { children: React.ReactNode; userId?: string }) {
  const queryClient = useMemo(() => createQueryClient(), []);

  const persistOptions = useMemo(() => {
    const cacheKey = `queryClient-${userId ?? 'anonymous'}`;
    const mmkvPersister = createMMKVPersister(cacheKey);

    return {
      persister: mmkvPersister,
      dehydrateOptions,
      maxAge: 24 * 60 * 60 * 1000,
    };
  }, [userId]);

  // useReactQueryDevTools(queryClient);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      {children}
    </PersistQueryClientProvider>
  );
}
