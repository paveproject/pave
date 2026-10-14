// Keeps a user's recovery key (the DEK that will eventually protect their
// manif-mode data - see the project's own "manif mode" plan) continuously
// split (Shamir's Secret Sharing) across their *current* accepted trusted
// contacts, so a quorum of them can reconstruct it if every one of this
// user's own devices is ever lost. The DEK itself never leaves a device
// in plaintext - only per-contact-device sealed shares (see `seal.ts`) do,
// and the server stores and serves those blind to their contents.
//
// Separately, it keeps a full (non-Shamir) copy of the DEK synced across
// this *same* user's own other devices - "you, trusting yourself", not a
// quorum problem, so no splitting involved, just a direct seal per
// sibling device.
//
// Nothing downstream consumes the DEK yet (that's a later phase) - this
// module's whole job is generating it and keeping both of those in sync.
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

export { clearReceivedShare, getDeviceId, setDeviceId, wipeOwnRecoveryState } from './storage';

const DEK_LENGTH = 32;

export interface AcceptedContact {
  /** The `trusted_contact` relationship id - what `PUT /me/trusted-contacts/shares` keys on. */
  relationshipId: string;
  contactUserId: string;
  /** Every device that contact has registered - empty until their first
   * device has uploaded one, in which case this contact isn't eligible
   * yet (see `planReconciliation`). A contact with N devices needs a
   * sealed copy of their share for each. */
  contactDevices: { deviceId: string; publicKey: string }[];
}

/** One of this same user's devices - pass the *complete* list (including
 * the calling device itself) into `planReconciliation`, which picks out
 * and excludes "self" using its own `thisDeviceId` parameter. */
export interface OwnDevice {
  deviceId: string;
  publicKey: string;
}

export interface ShareUpload {
  trustedContactId: string;
  deviceId: string;
  encryptedShare: string;
}

export interface DeviceDekUpload {
  deviceId: string;
  encryptedDek: string;
}

export type ReconciliationPlan =
  | { kind: 'noop' }
  | {
      kind: 'rotate';
      shareUploads: ShareUpload[];
      deviceDekUploads: DeviceDekUpload[];
      nextState: RecoveryKeySyncState;
    };

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

/** The current identity public key (hex), whether just generated or
 * already existing - not secret, safe to upload/display in full. `null`
 * only if `ensureIdentityKeypair` hasn't run yet. */
export async function getIdentityPublicKeyHex(): Promise<string | null> {
  const identity = await getIdentityKeypair();
  return identity ? bytesToHex(identity.publicKey) : null;
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...b].sort();
  return [...a].sort().every((id, i) => id === sorted[i]);
}

/**
 * Decides whether the recovery key needs (re-)splitting/resyncing for the
 * given accepted contacts and own other devices, and if so, produces the
 * new sealed uploads for both.
 *
 * - No eligible contacts and no other devices: nothing to do yet.
 * - Exactly one eligible contact: Shamir needs at least 2 shares to mean
 *   anything, so this seals the DEK directly to that one contact's
 *   device(s) (same envelope shape, `threshold: 1` - equivalent to a
 *   1-of-1 scheme, which is all a single trusted contact can ever be).
 * - Two or more: a real Shamir split, threshold defaulting to a majority.
 *   A contact with N devices gets N sealed copies of the *same* share
 *   value (redundant copies, not additional shares).
 * - Neither set changed since the last sync: no-op.
 * - A contact or an own device was removed: the DEK itself rotates (a new
 *   one is generated) - re-splitting/re-sealing the *same* DEK wouldn't
 *   revoke anything, since the removed party's old copy still works.
 * - Only additions: the *existing* DEK is re-split/re-sealed across the
 *   new, larger sets (Shamir doesn't support adding a share to an
 *   existing split in-place - every contact gets a fresh share, including
 *   ones that already had one).
 * - Own devices always get a *full* direct seal of the DEK (no
 *   splitting), together with the resulting `contactIds`/`ownDeviceIds`
 *   so a sibling that receives it (see `receiveDek`) ends up with the
 *   exact same synced state as the device that performed this split,
 *   instead of mistakenly treating itself as never-synced on its own
 *   next reconciliation pass.
 *
 * `allOwnDevices` must be the user's *complete* device list, including
 * this one (`thisDeviceId` picks it out) - not pre-filtered to "the
 * others". The stored/transmitted `ownDeviceIds` needs to be this same
 * canonical, perspective-independent set on every device: if each device
 * instead excluded only *itself* before computing it, two different
 * devices would persist two different "other devices" lists for the same
 * rotation, and each would see a spurious mismatch (and re-rotate) the
 * next time it recomputes its own. Self-exclusion is applied only when
 * deciding who actually needs an envelope sealed to them, not to this
 * tracked set.
 */
export async function planReconciliation(
  accepted: AcceptedContact[],
  allOwnDevices: OwnDevice[],
  thisDeviceId: string,
): Promise<ReconciliationPlan> {
  const eligible = accepted.filter((contact) => contact.contactDevices.length > 0);
  const eligibleIds = eligible.map((contact) => contact.contactUserId);
  const ownDeviceIds = allOwnDevices.map((device) => device.deviceId);
  const siblingDevices = allOwnDevices.filter((device) => device.deviceId !== thisDeviceId);

  const synced = await getSyncedState();
  const unchanged =
    synced !== null &&
    sameSet(eligibleIds, synced.contactIds) &&
    sameSet(ownDeviceIds, synced.ownDeviceIds);
  if (unchanged) {
    return { kind: 'noop' };
  }
  if (eligible.length === 0 && siblingDevices.length === 0) {
    return { kind: 'noop' };
  }

  const removedSomeone =
    synced !== null &&
    (synced.contactIds.some((id) => !eligibleIds.includes(id)) ||
      synced.ownDeviceIds.some((id) => !ownDeviceIds.includes(id)));
  const generation = synced && !removedSomeone ? synced.generation : (synced?.generation ?? 0) + 1;

  let dek = removedSomeone || !synced ? null : await getDek();
  if (!dek) {
    dek = crypto.getRandomValues(new Uint8Array(DEK_LENGTH));
    await setDek(dek);
  }

  const threshold = eligible.length === 1 ? 1 : Math.max(2, Math.ceil(eligible.length / 2));
  const shares =
    eligible.length === 0
      ? []
      : eligible.length === 1
        ? [dek]
        : await ShamirSecretSharing.split(dek, eligible.length, threshold);

  const shareUploads: ShareUpload[] = eligible.flatMap((contact, index) => {
    const envelope = JSON.stringify({
      generation,
      threshold,
      share: bytesToHex(shares[index]),
    });
    return contact.contactDevices.map((device) => ({
      trustedContactId: contact.relationshipId,
      deviceId: device.deviceId,
      encryptedShare: seal(new TextEncoder().encode(envelope), hexToBytes(device.publicKey)),
    }));
  });

  const deviceDekUploads: DeviceDekUpload[] = siblingDevices.map((device) => {
    const envelope = JSON.stringify({
      generation,
      contactIds: eligibleIds,
      ownDeviceIds,
      dek: bytesToHex(dek),
    });
    return {
      deviceId: device.deviceId,
      encryptedDek: seal(new TextEncoder().encode(envelope), hexToBytes(device.publicKey)),
    };
  });

  return {
    kind: 'rotate',
    shareUploads,
    deviceDekUploads,
    nextState: { contactIds: eligibleIds, ownDeviceIds, generation },
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

/**
 * The own-device counterpart of `receiveShare`: opens a full DEK copy a
 * sibling device has sealed for this one and adopts it directly, no
 * quorum involved. Also adopts the sender's synced state verbatim (same
 * `generation`/`contactIds`/`ownDeviceIds`), so this device's own next
 * reconciliation pass sees itself as already caught up instead of
 * mistaking a fresh sync for a change that needs rotating again.
 */
export async function receiveDek(sealedHex: string): Promise<boolean> {
  const identity = await getIdentityKeypair();
  if (!identity) return false;

  try {
    const plaintext = unseal(sealedHex, identity.privateKey);
    const envelope = JSON.parse(new TextDecoder().decode(plaintext)) as {
      generation: number;
      contactIds: string[];
      ownDeviceIds: string[];
      dek: string;
    };
    await setDek(hexToBytes(envelope.dek));
    await setSyncedState({
      contactIds: envelope.contactIds,
      ownDeviceIds: envelope.ownDeviceIds,
      generation: envelope.generation,
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
 * `__DEV__`-only debug screen (`settings/debug/recovery-keys.tsx`) - the
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
