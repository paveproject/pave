import * as SecureStore from 'expo-secure-store';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { IdentityKeypair } from './seal';

// This device's own recovery-key identity keypair (X25519) - generated
// once, the private half never leaves the device. Lets another user seal
// a Shamir share to this user (see `seal.ts`), and lets this device open
// a share another user has sealed to it when acting as a trusted contact.
const IDENTITY_PRIVATE_KEY = 'pave_recovery_identity_sk';
const IDENTITY_PUBLIC_KEY = 'pave_recovery_identity_pk';

export const getIdentityKeypair = async (): Promise<IdentityKeypair | null> => {
  const [privateKey, publicKey] = await Promise.all([
    SecureStore.getItemAsync(IDENTITY_PRIVATE_KEY),
    SecureStore.getItemAsync(IDENTITY_PUBLIC_KEY),
  ]);
  if (!privateKey || !publicKey) return null;
  return { privateKey: hexToBytes(privateKey), publicKey: hexToBytes(publicKey) };
};

export const setIdentityKeypair = async (keypair: IdentityKeypair): Promise<void> => {
  await Promise.all([
    SecureStore.setItemAsync(IDENTITY_PRIVATE_KEY, bytesToHex(keypair.privateKey)),
    SecureStore.setItemAsync(IDENTITY_PUBLIC_KEY, bytesToHex(keypair.publicKey)),
  ]);
};

// This device's server-assigned `device` row id (see `PUT /me/devices`) -
// the server keys that table on `(userId, publicKey)`, not the session, so
// this is the one durable way for this device to know "which row is me"
// (e.g. to filter itself out of its own "other devices" list, or to match
// an incoming `device_dek_updated` event against itself).
const DEVICE_ID = 'pave_recovery_device_id';

export const getDeviceId = async (): Promise<string | null> => {
  return SecureStore.getItemAsync(DEVICE_ID);
};

export const setDeviceId = async (deviceId: string): Promise<void> => {
  await SecureStore.setItemAsync(DEVICE_ID, deviceId);
};

// This user's own recovery key (the DEK), as an owner - never leaves the
// device in plaintext, only its Shamir shares (sealed per contact) do.
const RECOVERY_DEK = 'pave_recovery_dek';

export const getDek = async (): Promise<Uint8Array | null> => {
  const value = await SecureStore.getItemAsync(RECOVERY_DEK);
  return value ? hexToBytes(value) : null;
};

export const setDek = async (dek: Uint8Array): Promise<void> => {
  await SecureStore.setItemAsync(RECOVERY_DEK, bytesToHex(dek));
};

// What the last split was for - lets reconciliation tell "a contact (or
// own device) was added" from "...was removed" against the *current*
// eligible sets, without re-deriving it from scratch (and without the
// server ever seeing this, since `threshold`/`generation` live only in the
// sealed envelope). One shared generation across both groups, since both
// protect the same DEK - either group shrinking rotates it for both.
export interface RecoveryKeySyncState {
  contactIds: string[];
  ownDeviceIds: string[];
  generation: number;
}

// `_v2`: the previous single-device-only scheme (`user.publicKey`,
// `trustedContact.encryptedShare`) was dropped server-side rather than
// migrated (nothing downstream consumed the DEK yet) - a new key name
// makes any pre-upgrade local state read as "no prior sync" instead of
// matching the old, narrower shape.
const SYNCED_STATE = 'pave_recovery_synced_state_v2';

export const getSyncedState = async (): Promise<RecoveryKeySyncState | null> => {
  const value = await SecureStore.getItemAsync(SYNCED_STATE);
  return value ? (JSON.parse(value) as RecoveryKeySyncState) : null;
};

export const setSyncedState = async (state: RecoveryKeySyncState): Promise<void> => {
  await SecureStore.setItemAsync(SYNCED_STATE, JSON.stringify(state));
};

// A share another user sealed to this device, decrypted once and cached -
// keyed by the owner's user id, since this device can be a trusted
// contact for more than one owner at a time.
const receivedShareKey = (ownerId: string) => `pave_recovery_received_share_${ownerId}`;

export interface ReceivedShare {
  generation: number;
  threshold: number;
  share: Uint8Array;
}

export const getReceivedShare = async (ownerId: string): Promise<ReceivedShare | null> => {
  const value = await SecureStore.getItemAsync(receivedShareKey(ownerId));
  if (!value) return null;
  const parsed = JSON.parse(value) as { generation: number; threshold: number; share: string };
  return { ...parsed, share: hexToBytes(parsed.share) };
};

export const setReceivedShare = async (ownerId: string, share: ReceivedShare): Promise<void> => {
  await SecureStore.setItemAsync(
    receivedShareKey(ownerId),
    JSON.stringify({ ...share, share: bytesToHex(share.share) }),
  );
};

/** Called when that owner revokes this device as a trusted contact (see
 * `trusted_contact_revoked` in `useUserEventsSocket`) - the share is for a
 * DEK generation that owner has since abandoned, so there's nothing left
 * to keep it around for. */
export const clearReceivedShare = async (ownerId: string): Promise<void> => {
  await SecureStore.deleteItemAsync(receivedShareKey(ownerId));
};

/**
 * `__DEV__`-only: wipes this device's own identity/DEK/sync state, so it
 * behaves like a brand-new device on next launch - the only way to
 * re-test "I lost every device" repeatedly without a full reinstall.
 * Deliberately doesn't touch cached received shares (this device's role
 * *as a contact* for others) - simulating losing your own recovery setup
 * doesn't require also forgetting what you're holding for other people.
 */
export const wipeOwnRecoveryState = async (): Promise<void> => {
  await Promise.all([
    SecureStore.deleteItemAsync(IDENTITY_PRIVATE_KEY),
    SecureStore.deleteItemAsync(IDENTITY_PUBLIC_KEY),
    SecureStore.deleteItemAsync(DEVICE_ID),
    SecureStore.deleteItemAsync(RECOVERY_DEK),
    SecureStore.deleteItemAsync(SYNCED_STATE),
  ]);
};
