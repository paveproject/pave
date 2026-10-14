// Keeps a user's recovery key (the DEK that will eventually protect their
// manif-mode data - see the project's own "manif mode" plan) continuously
// split (Shamir's Secret Sharing) across their *current* accepted trusted
// contacts, so a quorum of them can reconstruct it if this device is ever
// lost. The DEK itself never leaves this device in plaintext - only
// per-contact sealed shares (see `seal.ts`) do, and the server stores and
// serves those blind to their contents.
//
// Nothing downstream consumes the DEK yet (that's a later phase) - this
// module's whole job is generating it and keeping its split in sync with
// the trusted-contact list.
import * as ShamirSecretSharing from 'shamir-secret-sharing';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { generateIdentityKeypair, seal, unseal } from './seal';
import {
  getDek,
  getIdentityKeypair,
  getReceivedShare,
  getSyncedState,
  setDek,
  setIdentityKeypair,
  setReceivedShare,
  setSyncedState,
  type RecoveryKeySyncState,
} from './storage';

export { clearReceivedShare } from './storage';

const DEK_LENGTH = 32;

export interface AcceptedContact {
  /** The `trusted_contact` relationship id - what `PUT /me/trusted-contacts/shares` keys on. */
  relationshipId: string;
  contactUserId: string;
  /** `null` until that contact's own device has uploaded one - not yet
   * eligible to receive a share (see `planReconciliation`). */
  contactPublicKey: string | null;
}

export interface ShareUpload {
  id: string;
  encryptedShare: string;
}

export type ReconciliationPlan =
  | { kind: 'noop' }
  | { kind: 'rotate'; uploads: ShareUpload[]; nextState: RecoveryKeySyncState };

/** Generates this device's identity keypair if it doesn't have one yet.
 * Returns the public key (hex) to upload, or `null` if one already exists
 * and there's nothing new to upload. */
export async function ensureIdentityKeypair(): Promise<string | null> {
  const existing = await getIdentityKeypair();
  if (existing) return null;

  const keypair = generateIdentityKeypair();
  await setIdentityKeypair(keypair);
  return bytesToHex(keypair.publicKey);
}

function sameContactSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...b].sort();
  return [...a].sort().every((id, i) => id === sorted[i]);
}

/**
 * Decides whether the recovery key needs (re-)splitting for the given
 * accepted contacts, and if so, produces the new sealed shares to upload.
 *
 * - No eligible contacts: nothing to do yet.
 * - Exactly one: Shamir needs at least 2 shares to mean anything, so this
 *   seals the DEK directly to that one contact (same envelope shape,
 *   `threshold: 1` - equivalent to a 1-of-1 scheme, which is all a single
 *   trusted contact can ever be).
 * - Two or more: a real Shamir split, threshold defaulting to a majority.
 * - Set unchanged since the last split: no-op.
 * - A contact was removed: the DEK itself rotates (a new one is generated)
 *   - re-splitting the *same* DEK wouldn't revoke anything, since the
 *     removed contact's old share still reconstructs it in collusion with
 *     enough others.
 * - Only additions: the *existing* DEK is re-split across the new, larger
 *   set (Shamir doesn't support adding a share to an existing split
 *   in-place - every contact gets a fresh share, including ones that
 *   already had one).
 */
export async function planReconciliation(accepted: AcceptedContact[]): Promise<ReconciliationPlan> {
  const eligible = accepted.filter(
    (contact): contact is AcceptedContact & { contactPublicKey: string } =>
      contact.contactPublicKey !== null,
  );
  const eligibleIds = eligible.map((contact) => contact.contactUserId);

  const synced = await getSyncedState();
  if (synced && sameContactSet(eligibleIds, synced.contactIds)) {
    return { kind: 'noop' };
  }
  if (eligible.length === 0) {
    return { kind: 'noop' };
  }

  const removedSomeone =
    synced !== null && synced.contactIds.some((id) => !eligibleIds.includes(id));
  const generation = synced && !removedSomeone ? synced.generation : (synced?.generation ?? 0) + 1;

  let dek = removedSomeone || !synced ? null : await getDek();
  if (!dek) {
    dek = crypto.getRandomValues(new Uint8Array(DEK_LENGTH));
    await setDek(dek);
  }

  const threshold = eligible.length === 1 ? 1 : Math.max(2, Math.ceil(eligible.length / 2));
  const shares =
    eligible.length === 1
      ? [dek]
      : await ShamirSecretSharing.split(dek, eligible.length, threshold);

  const uploads: ShareUpload[] = eligible.map((contact, index) => {
    const envelope = JSON.stringify({
      generation,
      threshold,
      share: bytesToHex(shares[index]),
    });
    return {
      id: contact.relationshipId,
      encryptedShare: seal(
        new TextEncoder().encode(envelope),
        hexToBytes(contact.contactPublicKey),
      ),
    };
  });

  return {
    kind: 'rotate',
    uploads,
    nextState: { contactIds: eligibleIds, generation },
  };
}

export async function commitReconciliation(plan: ReconciliationPlan): Promise<void> {
  if (plan.kind === 'noop') return;
  await setSyncedState(plan.nextState);
}

/**
 * The other side of `planReconciliation`: when acting as a trusted
 * contact, opens a share an owner has sealed for this device and caches
 * it decrypted - there's no UI consuming it yet (that's the
 * recovery-reconstruction flow, a later phase), just keeping it ready.
 * Silently does nothing on a share that isn't actually ours to open (a
 * stale/foreign blob, or no identity keypair yet) rather than throwing,
 * since this runs opportunistically off list refreshes and realtime
 * events, not a user action.
 */
export async function receiveShare(ownerId: string, sealedHex: string): Promise<boolean> {
  const identity = await getIdentityKeypair();
  if (!identity) return false;

  try {
    const plaintext = unseal(sealedHex, identity.privateKey);
    const envelope = JSON.parse(new TextDecoder().decode(plaintext)) as {
      generation: number;
      threshold: number;
      share: string;
    };
    await setReceivedShare(ownerId, {
      generation: envelope.generation,
      threshold: envelope.threshold,
      share: hexToBytes(envelope.share),
    });
    return true;
  } catch {
    return false;
  }
}

export interface RecoveryKeyDebugSnapshot {
  hasIdentityKeypair: boolean;
  /** Not secret - the public half, safe to display in full. */
  publicKeyHex: string | null;
  hasDek: boolean;
  /** One-way fingerprint (sha256, truncated) - never the DEK itself. */
  dekFingerprint: string | null;
  syncedState: RecoveryKeySyncState | null;
}

/**
 * Non-secret summary of this device's local recovery-key state, for the
 * `__DEV__`-only debug screen (`settings/recovery-key-debug.tsx`) - the
 * only way to see that `useRecoveryKeySync`/`useReceiveShares` actually
 * ran without digging through Metro logs or the database by hand. Never
 * returns the DEK or private key themselves.
 */
export async function getDebugSnapshot(): Promise<RecoveryKeyDebugSnapshot> {
  const [identity, dek, syncedState] = await Promise.all([
    getIdentityKeypair(),
    getDek(),
    getSyncedState(),
  ]);
  return {
    hasIdentityKeypair: !!identity,
    publicKeyHex: identity ? bytesToHex(identity.publicKey) : null,
    hasDek: !!dek,
    dekFingerprint: dek ? bytesToHex(sha256(dek)).slice(0, 16) : null,
    syncedState,
  };
}

export interface ReceivedShareDebugInfo {
  present: boolean;
  generation: number | null;
  threshold: number | null;
}

/** Same non-secret-exposure principle as `getDebugSnapshot`, for a share
 * received from a given owner - the share bytes themselves never leave
 * `lib/recoveryKey`. */
export async function getReceivedShareDebugInfo(ownerId: string): Promise<ReceivedShareDebugInfo> {
  const share = await getReceivedShare(ownerId);
  if (!share) return { present: false, generation: null, threshold: null };
  return { present: true, generation: share.generation, threshold: share.threshold };
}
