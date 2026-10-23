import { createMMKV } from 'react-native-mmkv';
import type { StorageAdapter } from '@tanstack/offline-transactions/react-native';

/**
 * `@tanstack/offline-transactions` ships no React Native storage adapter
 * - its own docs say to copy a bespoke `AsyncStorage`-backed one into the
 * app. This backs it with MMKV instead, since that's already this app's
 * storage engine everywhere else (query-client cache, zustand stores) -
 * no reason to add a second one. MMKV's API is synchronous; the adapter
 * interface just wants it wrapped in resolved promises.
 */
export const createOfflineTransactionsStorage = (namespace: string): StorageAdapter => {
  const mmkv = createMMKV({ id: `offline-transactions-${namespace}` });

  return {
    get: async (key) => mmkv.getString(key) ?? null,
    set: async (key, value) => {
      mmkv.set(key, value);
    },
    delete: async (key) => {
      mmkv.remove(key);
    },
    keys: async () => mmkv.getAllKeys(),
    clear: async () => {
      mmkv.clearAll();
    },
  };
};
