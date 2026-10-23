// A 24-word BIP-39 recovery phrase as a 3rd way back into an account's
// recovery DEK, independent of the trusted-contacts quorum path (see
// `index.ts`'s own doc comment) - entering it on a fresh device decrypts
// the DEK directly, with no delay and no quorum. Same AEAD as `seal.ts`
// (XChaCha20-Poly1305), but symmetric: both ends derive the identical key
// straight from the phrase, so there's no ephemeral keypair/ECDH step and
// the envelope is just `nonce || ciphertext`.
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

// Distinct from `seal.ts`'s own HKDF_INFO - two different constructions
// must never be able to derive the same key from the same input bytes.
const HKDF_INFO = new TextEncoder().encode('pave-recovery-mnemonic-seal');
const NONCE_LENGTH = 24;
const MNEMONIC_STRENGTH_BITS = 256; // 24 words

export const generateRecoveryMnemonic = (): string =>
  generateMnemonic(wordlist, MNEMONIC_STRENGTH_BITS);

const normalize = (phrase: string): string => phrase.trim().toLowerCase();

export const isValidRecoveryMnemonic = (phrase: string): boolean =>
  validateMnemonic(normalize(phrase), wordlist);

/**
 * HKDF straight from the phrase's raw entropy - deliberately not BIP-39's
 * own `mnemonicToSeed` (PBKDF2 over the mnemonic *string*, meant to slow
 * down guessing a human-memorized passphrase). Pointless overhead here:
 * the entropy came from `generateMnemonic`'s own secure RNG, not a human's
 * memory, so there's nothing low-entropy to stretch against.
 */
export function deriveMnemonicDerivedKey(phrase: string): Uint8Array {
  const entropy = mnemonicToEntropy(normalize(phrase), wordlist);
  return hkdf(sha256, entropy, undefined, HKDF_INFO, 32);
}

/** Returns a hex string: nonce || ciphertext. */
export function sealWithMnemonicKey(plaintext: Uint8Array, key: Uint8Array): string {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);

  const envelope = new Uint8Array(nonce.length + ciphertext.length);
  envelope.set(nonce, 0);
  envelope.set(ciphertext, nonce.length);
  return bytesToHex(envelope);
}

/**
 * Throws (AEAD auth failure) on a wrong phrase - the caller's job to show
 * a graceful error. No attempt counter or lockout: there's no server-side
 * guess verification at all here to protect against brute force.
 */
export function unsealWithMnemonicKey(sealedHex: string, key: Uint8Array): Uint8Array {
  const envelope = hexToBytes(sealedHex);
  const nonce = envelope.subarray(0, NONCE_LENGTH);
  const ciphertext = envelope.subarray(NONCE_LENGTH);
  return xchacha20poly1305(key, nonce).decrypt(ciphertext);
}
