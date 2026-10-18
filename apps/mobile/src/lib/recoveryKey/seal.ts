// Sealed-box style encryption: anonymous-sender, authenticated-recipient.
// Anyone can seal a message to a public key, but only the matching private
// key can open it - exactly what's needed to hand a Shamir share to the
// server for safekeeping without the server (or anyone else) ever being
// able to read it.
//
// Construction: an ephemeral X25519 keypair, ECDH with the recipient's
// public key, HKDF to derive a symmetric key, then XChaCha20-Poly1305 for
// the actual authenticated encryption. The ephemeral public key and nonce
// travel alongside the ciphertext (nothing here is secret on its own -
// only the ECDH shared secret, which only the recipient's private key can
// reproduce, is).
import { x25519 } from '@noble/curves/ed25519.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

const HKDF_INFO = new TextEncoder().encode('pave-recovery-share-seal');
const NONCE_LENGTH = 24;
const PUBLIC_KEY_LENGTH = 32;

export interface IdentityKeypair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

export const generateIdentityKeypair = (): IdentityKeypair => {
  const privateKey = x25519.utils.randomSecretKey();
  return { privateKey, publicKey: x25519.getPublicKey(privateKey) };
};

function deriveSymmetricKey(sharedSecret: Uint8Array): Uint8Array {
  return hkdf(sha256, sharedSecret, undefined, HKDF_INFO, 32);
}

/** Returns a hex string: ephemeral public key || nonce || ciphertext. */
export function seal(plaintext: Uint8Array, recipientPublicKey: Uint8Array): string {
  const ephemeral = generateIdentityKeypair();
  const key = deriveSymmetricKey(x25519.getSharedSecret(ephemeral.privateKey, recipientPublicKey));
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);

  const envelope = new Uint8Array(ephemeral.publicKey.length + nonce.length + ciphertext.length);
  envelope.set(ephemeral.publicKey, 0);
  envelope.set(nonce, ephemeral.publicKey.length);
  envelope.set(ciphertext, ephemeral.publicKey.length + nonce.length);
  return bytesToHex(envelope);
}

/** Throws if `sealedHex` wasn't sealed to the matching public key. */
export function unseal(sealedHex: string, recipientPrivateKey: Uint8Array): Uint8Array {
  const envelope = hexToBytes(sealedHex);
  const ephemeralPublicKey = envelope.subarray(0, PUBLIC_KEY_LENGTH);
  const nonce = envelope.subarray(PUBLIC_KEY_LENGTH, PUBLIC_KEY_LENGTH + NONCE_LENGTH);
  const ciphertext = envelope.subarray(PUBLIC_KEY_LENGTH + NONCE_LENGTH);

  const key = deriveSymmetricKey(x25519.getSharedSecret(recipientPrivateKey, ephemeralPublicKey));
  return xchacha20poly1305(key, nonce).decrypt(ciphertext);
}
