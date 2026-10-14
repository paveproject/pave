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

// What the last split was for - lets reconciliation tell "a contact was
// added" from "a contact was removed" against the *current* accepted list,
// without re-deriving it from scratch (and without the server ever seeing
// this, since `threshold`/`generation` live only in the sealed envelope).
export interface RecoveryKeySyncState {
  contactIds: string[];
  generation: number;
}

const SYNCED_STATE = 'pave_recovery_synced_state';

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
