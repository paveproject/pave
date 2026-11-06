import {
  MissingDekError,
  decryptBlob,
  encryptBlob,
  mintSessionKey,
  openMetadata,
  openSessionKey,
  resealSessionKeys,
  sealMetadata,
  sealSessionKey,
} from './crypto';
import { getDek } from '../recoveryKey/storage';

jest.mock('../recoveryKey/storage', () => ({ getDek: jest.fn() }));

const mockedGetDek = getDek as jest.MockedFunction<typeof getDek>;

/** Stands in for SecureStore: whatever DEK the account currently holds. */
const withDek = (dek: Uint8Array | null) => mockedGetDek.mockResolvedValue(dek);

const dekOf = (fill: number) => new Uint8Array(32).fill(fill);
const USER = 'user-1';

beforeEach(() => mockedGetDek.mockReset());

describe('session keys', () => {
  it('seals and reopens a session key under the account DEK', async () => {
    withDek(dekOf(1));
    const key = mintSessionKey();

    const reopened = await openSessionKey(USER, await sealSessionKey(USER, key));

    expect(reopened).toEqual(key);
  });

  it('mints a different key every time', () => {
    expect(mintSessionKey()).not.toEqual(mintSessionKey());
  });

  it('refuses to protect anything when the account has no DEK yet', async () => {
    withDek(null);
    await expect(sealSessionKey(USER, mintSessionKey())).rejects.toThrow(MissingDekError);
  });

  it('cannot be opened with a different DEK', async () => {
    withDek(dekOf(1));
    const sealed = await sealSessionKey(USER, mintSessionKey());

    withDek(dekOf(2));
    await expect(openSessionKey(USER, sealed)).rejects.toThrow();
  });
});

describe('blobs', () => {
  it('round-trips a payload unchanged', () => {
    const key = mintSessionKey();
    const plaintext = new TextEncoder().encode('[{"lat":48.8566,"lng":2.3522}]');

    expect(decryptBlob(key, encryptBlob(key, plaintext))).toEqual(plaintext);
  });

  it('produces different ciphertext for the same payload', () => {
    // A fresh nonce per blob: identical position batches must not be
    // recognisable as identical from the ciphertext alone.
    const key = mintSessionKey();
    const plaintext = new TextEncoder().encode('same');

    expect(encryptBlob(key, plaintext)).not.toEqual(encryptBlob(key, plaintext));
  });

  it('rejects a payload from another session', () => {
    const plaintext = new TextEncoder().encode('evidence');
    const ciphertext = encryptBlob(mintSessionKey(), plaintext);

    expect(() => decryptBlob(mintSessionKey(), ciphertext)).toThrow();
  });

  it('detects a tampered payload instead of returning garbage', () => {
    const key = mintSessionKey();
    const ciphertext = encryptBlob(key, new TextEncoder().encode('evidence'));
    ciphertext[ciphertext.length - 1] ^= 0xff;

    expect(() => decryptBlob(key, ciphertext)).toThrow();
  });
});

describe('metadata', () => {
  it('round-trips the session envelope', () => {
    const key = mintSessionKey();
    const envelope = { startedAt: '2026-11-06T18:00:00.000Z', endedAt: null };

    expect(openMetadata(key, sealMetadata(key, envelope))).toEqual(envelope);
  });

  it('cannot be opened with another session key', () => {
    const sealed = sealMetadata(mintSessionKey(), { startedAt: 'x', endedAt: null });

    expect(() => openMetadata(mintSessionKey(), sealed)).toThrow();
  });

  /** The metadata key is derived with its own HKDF info, so a blob key must
   * not open an envelope even though both come from the same session key. */
  it('is not interchangeable with the blob key', () => {
    const key = mintSessionKey();
    const sealed = sealMetadata(key, { startedAt: 'x', endedAt: null });

    expect(() => decryptBlob(key, Buffer.from(sealed, 'hex'))).toThrow();
  });
});

describe('DEK rotation', () => {
  /**
   * The regression that killed the first version of this feature. Removing a
   * trusted contact mints a brand-new random DEK, so anything sealed under
   * the old one has to be re-sealed - and because the blobs are under a
   * session key rather than the DEK itself, re-sealing 32 bytes is enough to
   * keep every recording readable.
   */
  it('keeps recordings readable across a rotation', async () => {
    const oldDek = dekOf(1);
    withDek(oldDek);

    const sessionKey = mintSessionKey();
    const sealed = await sealSessionKey(USER, sessionKey);
    const ciphertext = encryptBlob(sessionKey, new TextEncoder().encode('trajectory'));

    // A contact is removed: commitReconciliation replaces the DEK.
    const newDek = dekOf(2);
    withDek(newDek);
    await expect(openSessionKey(USER, sealed)).rejects.toThrow();

    const resealed = await resealSessionKeys(USER, oldDek, { s1: sealed });
    const recovered = await openSessionKey(USER, resealed['s1']);

    expect(recovered).toEqual(sessionKey);
    expect(decryptBlob(recovered, ciphertext)).toEqual(new TextEncoder().encode('trajectory'));
  });

  it('re-seals every session in one pass', async () => {
    const oldDek = dekOf(1);
    withDek(oldDek);
    const keys = { a: mintSessionKey(), b: mintSessionKey(), c: mintSessionKey() };
    const sealed = {
      a: await sealSessionKey(USER, keys.a),
      b: await sealSessionKey(USER, keys.b),
      c: await sealSessionKey(USER, keys.c),
    };

    withDek(dekOf(2));
    const resealed = await resealSessionKeys(USER, oldDek, sealed);

    for (const id of ['a', 'b', 'c'] as const) {
      expect(await openSessionKey(USER, resealed[id])).toEqual(keys[id]);
    }
  });

  it('does not touch the blobs, only the keys', async () => {
    // The whole point of the indirection: a rotation must never require
    // re-encrypting (or even reading) the recordings themselves.
    const oldDek = dekOf(1);
    withDek(oldDek);
    const sessionKey = mintSessionKey();
    const sealed = await sealSessionKey(USER, sessionKey);
    const ciphertext = encryptBlob(sessionKey, new TextEncoder().encode('untouched'));
    const before = Uint8Array.from(ciphertext);

    withDek(dekOf(2));
    await resealSessionKeys(USER, oldDek, { s1: sealed });

    expect(ciphertext).toEqual(before);
  });
});
