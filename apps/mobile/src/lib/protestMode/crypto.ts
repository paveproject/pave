// Encryption for protest-mode recordings. Same AEAD as the recovery-key paths
// (XChaCha20-Poly1305, envelope `nonce || ciphertext`), but blobs are
// encrypted under a **per-session key**, and only that 32-byte key is sealed
// under the account's DEK.
//
// Encrypting blobs under the DEK directly destroys history silently: removing
// a trusted contact mints a brand-new DEK (`commitReconciliation`), after
// which every earlier blob is undecryptable with no error anywhere. A
// rotation here re-seals 32 bytes per session and leaves the data alone.
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { getDek } from '../recoveryKey/storage';

// Distinct from `seal.ts` and `mnemonicSeal.ts`: two constructions must never
// be able to derive the same key from the same input bytes.
const SESSION_KEY_HKDF_INFO = new TextEncoder().encode('pave-protest-session-key');
const BLOB_HKDF_INFO = new TextEncoder().encode('pave-protest-blob');
const METADATA_HKDF_INFO = new TextEncoder().encode('pave-protest-metadata');
const NONCE_LENGTH = 24;
const KEY_LENGTH = 32;

/** No DEK on this device yet - in practice, a half-finished signup. */
export class MissingDekError extends Error {
  constructor() {
    super('no DEK for this account yet - cannot protect protest-mode data');
    this.name = 'MissingDekError';
  }
}

export const mintSessionKey = (): Uint8Array => crypto.getRandomValues(new Uint8Array(KEY_LENGTH));

/** `nonce || ciphertext`. Hex only where a value travels as text (a DB
 * column); blobs stay bytes end to end. */
const sealBytes = (key: Uint8Array, plaintext: Uint8Array): Uint8Array => {
  const nonce = crypto.getRandomValues(new Uint8Array(NONCE_LENGTH));
  const ciphertext = xchacha20poly1305(key, nonce).encrypt(plaintext);
  const envelope = new Uint8Array(nonce.length + ciphertext.length);
  envelope.set(nonce, 0);
  envelope.set(ciphertext, nonce.length);
  return envelope;
};

/** Throws on a wrong key (AEAD auth failure) rather than returning garbage. */
const openBytes = (key: Uint8Array, envelope: Uint8Array): Uint8Array =>
  xchacha20poly1305(key, envelope.subarray(0, NONCE_LENGTH)).decrypt(
    envelope.subarray(NONCE_LENGTH),
  );

const sealHex = (key: Uint8Array, plaintext: Uint8Array): string =>
  bytesToHex(sealBytes(key, plaintext));

const openHex = (key: Uint8Array, envelopeHex: string): Uint8Array =>
  openBytes(key, hexToBytes(envelopeHex));

/** The DEK only ever derives a cipher key, never acts as one, so the same
 * bytes can safely serve the other recovery paths. */
const deriveFromDek = async (userId: string, info: Uint8Array): Promise<Uint8Array> => {
  const dek = await getDek(userId);
  if (!dek) throw new MissingDekError();
  return hkdf(sha256, dek, undefined, info, KEY_LENGTH);
};

/** For storage on the server, which cannot open it. */
export const sealSessionKey = async (userId: string, sessionKey: Uint8Array): Promise<string> =>
  sealHex(await deriveFromDek(userId, SESSION_KEY_HKDF_INFO), sessionKey);

/** Throws once the DEK has rotated and the key has not been re-sealed yet -
 * which is what makes a missed `resealSessionKeys` visible. */
export const openSessionKey = async (userId: string, sealedHex: string): Promise<Uint8Array> =>
  openHex(await deriveFromDek(userId, SESSION_KEY_HKDF_INFO), sealedHex);

/**
 * Same, with the DEK handed in rather than read from this device's store. For
 * a trusted contact: the DEK they reconstruct belongs to the *owner*, so it
 * stays in memory and never reaches storage under the reader's own id.
 */
export const openSessionKeyWithDek = (dek: Uint8Array, sealedHex: string): Uint8Array =>
  openHex(hkdf(sha256, dek, undefined, SESSION_KEY_HKDF_INFO, KEY_LENGTH), sealedHex);

/** Call *after* a rotation is committed, passing the previous DEK: the keys
 * have to be opened with the old one before being sealed with the new. */
export const resealSessionKeys = async (
  userId: string,
  previousDek: Uint8Array,
  sealedBySessionId: Record<string, string>,
): Promise<Record<string, string>> => {
  const oldKey = hkdf(sha256, previousDek, undefined, SESSION_KEY_HKDF_INFO, KEY_LENGTH);
  const newKey = await deriveFromDek(userId, SESSION_KEY_HKDF_INFO);

  return Object.fromEntries(
    Object.entries(sealedBySessionId).map(([sessionId, sealed]) => [
      sessionId,
      sealHex(newKey, openHex(oldKey, sealed)),
    ]),
  );
};

/** Derived from the session key rather than being it, so that key never
 * doubles as a cipher key. */
const deriveBlobKey = (sessionKey: Uint8Array): Uint8Array =>
  hkdf(sha256, sessionKey, undefined, BLOB_HKDF_INFO, KEY_LENGTH);

export const encryptBlob = (sessionKey: Uint8Array, plaintext: Uint8Array): Uint8Array =>
  sealBytes(deriveBlobKey(sessionKey), plaintext);

export const decryptBlob = (sessionKey: Uint8Array, ciphertext: Uint8Array): Uint8Array =>
  openBytes(deriveBlobKey(sessionKey), ciphertext);

/** Sealed under the session key, not the DEK: a rotation then re-seals the
 * session key alone and the metadata follows for free. */
export const sealMetadata = (sessionKey: Uint8Array, envelope: unknown): string =>
  bytesToHex(
    sealBytes(
      hkdf(sha256, sessionKey, undefined, METADATA_HKDF_INFO, KEY_LENGTH),
      new TextEncoder().encode(JSON.stringify(envelope)),
    ),
  );

export const openMetadata = <T>(sessionKey: Uint8Array, sealedHex: string): T =>
  JSON.parse(
    new TextDecoder().decode(
      openBytes(
        hkdf(sha256, sessionKey, undefined, METADATA_HKDF_INFO, KEY_LENGTH),
        hexToBytes(sealedHex),
      ),
    ),
  ) as T;

/**
 * A media chunk's plaintext: a JSON header, then the raw media bytes.
 *
 * Timing has to travel *inside* the encryption, the way a position carries
 * its own `recordedAt` - the server deliberately keeps no timestamp on a blob
 * (see `protestSession.ts`). Hence one framed payload rather than a column:
 * `[4-byte big-endian header length][header][media]`.
 */
export interface MediaChunkHeader {
  startedAtMs: number;
  durationMs: number;
  /** As the OS wrote it - `audio/m4a` or `video/mp4`. */
  mimeType: string;
  /** Audio only. Audio is one rotated recording, so a segment has to admit
   * the silence lost at the boundary; a video is one whole clip, and claiming
   * a gap it does not have would be a lie in the other direction. */
  gapBeforeMs?: number;
}

const HEADER_LENGTH_BYTES = 4;

export const frameMediaChunk = (header: MediaChunkHeader, media: Uint8Array): Uint8Array => {
  const headerBytes = new TextEncoder().encode(JSON.stringify(header));
  const framed = new Uint8Array(HEADER_LENGTH_BYTES + headerBytes.length + media.length);
  new DataView(framed.buffer).setUint32(0, headerBytes.length, false);
  framed.set(headerBytes, HEADER_LENGTH_BYTES);
  framed.set(media, HEADER_LENGTH_BYTES + headerBytes.length);
  return framed;
};

export const parseMediaChunk = (
  framed: Uint8Array,
): { header: MediaChunkHeader; media: Uint8Array } => {
  if (framed.length < HEADER_LENGTH_BYTES) throw new Error('media chunk is too short to be framed');
  const headerLength = new DataView(framed.buffer, framed.byteOffset, framed.byteLength).getUint32(
    0,
    false,
  );
  const mediaStart = HEADER_LENGTH_BYTES + headerLength;
  if (mediaStart > framed.length) throw new Error('media chunk header length is out of bounds');

  return {
    header: JSON.parse(
      new TextDecoder().decode(framed.subarray(HEADER_LENGTH_BYTES, mediaStart)),
    ) as MediaChunkHeader,
    // A copy, not a view: callers hand this to the file layer, and a view
    // keeps the whole framed buffer (header and all) alive behind it.
    media: framed.slice(mediaStart),
  };
};
