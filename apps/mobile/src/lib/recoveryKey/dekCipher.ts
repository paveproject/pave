// Symmetric encryption with the account's own DEK (see `storage.ts`'s
// `getDek`) - for data the owner encrypts for themselves (protest-mode
// location/audio), not for sealing something to another party's public
// key, which is what `seal.ts`'s asymmetric sealed-box is for. Same
// XChaCha20-Poly1305 primitive, no ECDH/HKDF step needed since the DEK is
// already the symmetric key.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getDek } from './storage';

const NONCE_LENGTH = 24;

/** Returns a hex string: nonce || ciphertext. Throws if no DEK exists yet. */
export async function encryptWithDek(userId: string, plaintext: Uint8Array): Promise<string> {
  const dek = await getDek(userId);
  if (!dek) {
    throw new Error('no DEK for this account yet - cannot encrypt protest-mode data');
  }
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const ciphertext = xchacha20poly1305(dek, nonce).encrypt(plaintext);

  const envelope = new Uint8Array(nonce.length + ciphertext.length);
  envelope.set(nonce, 0);
  envelope.set(ciphertext, nonce.length);
  return bytesToHex(envelope);
}

export async function decryptWithDek(userId: string, envelopeHex: string): Promise<Uint8Array> {
  const dek = await getDek(userId);
  if (!dek) {
    throw new Error('no DEK for this account yet - cannot decrypt protest-mode data');
  }
  const envelope = hexToBytes(envelopeHex);
  const nonce = envelope.subarray(0, NONCE_LENGTH);
  const ciphertext = envelope.subarray(NONCE_LENGTH);
  return xchacha20poly1305(dek, nonce).decrypt(ciphertext);
}
