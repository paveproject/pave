import * as SecureStore from 'expo-secure-store';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { IdentityKeypair } from './seal';

// This device's own recovery-key identity keypair (X25519) - generated
// once per account, the private half never leaves the device. Lets
// another user seal a Shamir share to this user (see `seal.ts`), and lets
// this device open a share another user has sealed to it when acting as
// a trusted contact.
//
// Every key below is namespaced by the *currently signed-in* user's id -
// several accounts can share the same physical device (a friend
// borrowing your phone for a minute, a shared family device) without one
// account's identity/DEK/sync state ever being read, overwritten, or
// leaked by another's. Logging back into an account that already has a
// slot here finds it exactly as it left it - same public key, same
// device row, still `active` - logging into a *different* one just gets
// its own empty slot, never wiping or touching anyone else's.
const identityPrivateKeyId = (userId: string) => `pave_recovery_identity_sk_${userId}`;
const identityPublicKeyId = (userId: string) => `pave_recovery_identity_pk_${userId}`;

export const getIdentityKeypair = async (userId: string): Promise<IdentityKeypair | null> => {
  const [privateKey, publicKey] = await Promise.all([
    SecureStore.getItemAsync(identityPrivateKeyId(userId)),
    SecureStore.getItemAsync(identityPublicKeyId(userId)),
  ]);
  if (!privateKey || !publicKey) return null;
  return { privateKey: hexToBytes(privateKey), publicKey: hexToBytes(publicKey) };
};

export const setIdentityKeypair = async (
  userId: string,
  keypair: IdentityKeypair,
): Promise<void> => {
  await Promise.all([
    SecureStore.setItemAsync(identityPrivateKeyId(userId), bytesToHex(keypair.privateKey)),
    SecureStore.setItemAsync(identityPublicKeyId(userId), bytesToHex(keypair.publicKey)),
  ]);
};

// This device's server-assigned `device` row id (see `PUT /me/devices`) -
// the server keys that table on `(userId, publicKey)`, not the session, so
// this is the one durable way for this device to know "which row is me"
// (e.g. to filter itself out of its own "other devices" list, or to match
// an incoming `device_dek_updated` event against itself).
const deviceIdId = (userId: string) => `pave_recovery_device_id_${userId}`;

export const getDeviceId = async (userId: string): Promise<string | null> => {
  return SecureStore.getItemAsync(deviceIdId(userId));
};

export const setDeviceId = async (userId: string, deviceId: string): Promise<void> => {
  await SecureStore.setItemAsync(deviceIdId(userId), deviceId);
};

// This user's own recovery key (the DEK), as an owner - never leaves the
// device in plaintext, only its Shamir shares (sealed per contact) do.
const recoveryDekId = (userId: string) => `pave_recovery_dek_${userId}`;

export const getDek = async (userId: string): Promise<Uint8Array | null> => {
  const value = await SecureStore.getItemAsync(recoveryDekId(userId));
  return value ? hexToBytes(value) : null;
};

export const setDek = async (userId: string, dek: Uint8Array): Promise<void> => {
  await SecureStore.setItemAsync(recoveryDekId(userId), bytesToHex(dek));
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
const syncedStateId = (userId: string) => `pave_recovery_synced_state_v2_${userId}`;

export const getSyncedState = async (userId: string): Promise<RecoveryKeySyncState | null> => {
  const value = await SecureStore.getItemAsync(syncedStateId(userId));
  return value ? (JSON.parse(value) as RecoveryKeySyncState) : null;
};

export const setSyncedState = async (
  userId: string,
  state: RecoveryKeySyncState,
): Promise<void> => {
  await SecureStore.setItemAsync(syncedStateId(userId), JSON.stringify(state));
};

// A share another user sealed to this device, decrypted once and cached -
// keyed by *this* signed-in user's id (several accounts can hold shares on
// the same physical device, same reasoning as the identity keys above) as
// well as the owner's, since this device can be a trusted contact for more
// than one owner at a time.
const receivedShareId = (forUserId: string, ownerId: string) =>
  `pave_recovery_received_share_${forUserId}_${ownerId}`;

export interface ReceivedShare {
  generation: number;
  threshold: number;
  share: Uint8Array;
}

export const getReceivedShare = async (
  forUserId: string,
  ownerId: string,
): Promise<ReceivedShare | null> => {
  const value = await SecureStore.getItemAsync(receivedShareId(forUserId, ownerId));
  if (!value) return null;
  const parsed = JSON.parse(value) as { generation: number; threshold: number; share: string };
  return { ...parsed, share: hexToBytes(parsed.share) };
};

export const setReceivedShare = async (
  forUserId: string,
  ownerId: string,
  share: ReceivedShare,
): Promise<void> => {
  await SecureStore.setItemAsync(
    receivedShareId(forUserId, ownerId),
    JSON.stringify({ ...share, share: bytesToHex(share.share) }),
  );
};

/** Called when that owner revokes this device as a trusted contact (see
 * `trusted_contact_revoked` in `useUserEventsSocket`) - the share is for a
 * DEK generation that owner has since abandoned, so there's nothing left
 * to keep it around for. */
export const clearReceivedShare = async (forUserId: string, ownerId: string): Promise<void> => {
  await SecureStore.deleteItemAsync(receivedShareId(forUserId, ownerId));
};

// The recovery-phrase symmetric key (see `mnemonicSeal.ts`), cached only
// on whichever device most recently set up or re-confirmed the phrase -
// it never travels over the network, so only this one device can ever
// re-seal a rotated DEK under it (see `useReconcileMnemonicUpload`).
const mnemonicDerivedKeyId = (userId: string) => `pave_recovery_mnemonic_key_${userId}`;

export const getMnemonicDerivedKey = async (userId: string): Promise<Uint8Array | null> => {
  const value = await SecureStore.getItemAsync(mnemonicDerivedKeyId(userId));
  return value ? hexToBytes(value) : null;
};

export const setMnemonicDerivedKey = async (userId: string, key: Uint8Array): Promise<void> => {
  await SecureStore.setItemAsync(mnemonicDerivedKeyId(userId), bytesToHex(key));
};

export const clearMnemonicDerivedKey = async (userId: string): Promise<void> => {
  await SecureStore.deleteItemAsync(mnemonicDerivedKeyId(userId));
};

// A fingerprint (truncated sha256, same convention as `getDebugSnapshot`'s
// `dekFingerprint`) of the DEK this device last successfully uploaded
// under the recovery phrase - lets `useReconcileMnemonicUpload` skip a
// redundant re-seal+PUT when the server already has the current one.
const mnemonicUploadedFingerprintId = (userId: string) =>
  `pave_recovery_mnemonic_uploaded_fp_${userId}`;

export const getMnemonicUploadedFingerprint = async (userId: string): Promise<string | null> => {
  return SecureStore.getItemAsync(mnemonicUploadedFingerprintId(userId));
};

export const setMnemonicUploadedFingerprint = async (
  userId: string,
  fingerprint: string,
): Promise<void> => {
  await SecureStore.setItemAsync(mnemonicUploadedFingerprintId(userId), fingerprint);
};

export const clearMnemonicUploadedFingerprint = async (userId: string): Promise<void> => {
  await SecureStore.deleteItemAsync(mnemonicUploadedFingerprintId(userId));
};

/**
 * `__DEV__`-only: wipes this device's own identity/DEK/sync state for one
 * specific account, so it behaves like a brand-new device on next launch -
 * the only way to re-test "I lost every device" repeatedly without a full
 * reinstall. Deliberately doesn't touch cached received shares (this
 * device's role *as a contact* for others) - simulating losing your own
 * recovery setup doesn't require also forgetting what you're holding for
 * other people. Scoped to `userId` like everything else here - never
 * touches another account's slot on this same device.
 */
export const wipeOwnRecoveryState = async (userId: string): Promise<void> => {
  await Promise.all([
    SecureStore.deleteItemAsync(identityPrivateKeyId(userId)),
    SecureStore.deleteItemAsync(identityPublicKeyId(userId)),
    SecureStore.deleteItemAsync(deviceIdId(userId)),
    SecureStore.deleteItemAsync(recoveryDekId(userId)),
    SecureStore.deleteItemAsync(syncedStateId(userId)),
    SecureStore.deleteItemAsync(mnemonicDerivedKeyId(userId)),
    SecureStore.deleteItemAsync(mnemonicUploadedFingerprintId(userId)),
  ]);
};
