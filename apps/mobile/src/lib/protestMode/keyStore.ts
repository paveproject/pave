import * as SecureStore from 'expo-secure-store';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/**
 * Session keys at rest, in SecureStore - never in WatermelonDB, whose SQLite
 * file is not encrypted. Namespaced by account, like every key in
 * `lib/recoveryKey/storage.ts`, so a second account on one device can't reach
 * the first's sessions. Only the sealed form ever leaves here.
 */
const sessionKeyId = (userId: string, sessionId: string) =>
  `pave_protest_session_key_${userId}_${sessionId}`;

/** SecureStore has no key listing, and a DEK rotation has to re-seal every
 * one of them. */
const sessionIndexId = (userId: string) => `pave_protest_session_ids_${userId}`;

const readIndex = async (userId: string): Promise<string[]> => {
  const raw = await SecureStore.getItemAsync(sessionIndexId(userId));
  return raw ? (JSON.parse(raw) as string[]) : [];
};

export const setProtestSessionKey = async (
  userId: string,
  sessionId: string,
  key: Uint8Array,
): Promise<void> => {
  await SecureStore.setItemAsync(sessionKeyId(userId, sessionId), bytesToHex(key));
  const index = await readIndex(userId);
  if (!index.includes(sessionId)) {
    await SecureStore.setItemAsync(sessionIndexId(userId), JSON.stringify([...index, sessionId]));
  }
};

export const getProtestSessionKey = async (
  userId: string,
  sessionId: string,
): Promise<Uint8Array | null> => {
  const value = await SecureStore.getItemAsync(sessionKeyId(userId, sessionId));
  return value ? hexToBytes(value) : null;
};

/** Sign-out / account switch - the sealed copies on the server survive. */
export const clearAllProtestSessionKeys = async (userId: string): Promise<void> => {
  for (const sessionId of await readIndex(userId)) {
    await SecureStore.deleteItemAsync(sessionKeyId(userId, sessionId));
  }
  await SecureStore.deleteItemAsync(sessionIndexId(userId));
};
