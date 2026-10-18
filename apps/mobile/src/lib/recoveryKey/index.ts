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

/** Generates this device's identity keypair for `userId` if it doesn't
 * have one yet. Returns the public key (hex) to upload, or `null` if one
 * already exists and there's nothing new to upload. */
export async function ensureIdentityKeypair(userId: string): Promise<string | null> {
  const existing = await getIdentityKeypair(userId);
  if (existing) return null;

  const keypair = generateIdentityKeypair();
  await setIdentityKeypair(userId, keypair);
  return bytesToHex(keypair.publicKey);
}

/** The current identity public key (hex) for `userId`, whether just
 * generated or already existing - not secret, safe to upload/display in
 * full. `null` only if `ensureIdentityKeypair` hasn't run yet. */
export async function getIdentityPublicKeyHex(userId: string): Promise<string | null> {
  const identity = await getIdentityKeypair(userId);
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
  userId: string,
  accepted: AcceptedContact[],
  allOwnDevices: OwnDevice[],
  thisDeviceId: string,
): Promise<ReconciliationPlan> {
  const eligible = accepted.filter((contact) => contact.contactDevices.length > 0);
  const eligibleIds = eligible.map((contact) => contact.contactUserId);
  const ownDeviceIds = allOwnDevices.map((device) => device.deviceId);
  const siblingDevices = allOwnDevices.filter((device) => device.deviceId !== thisDeviceId);

  const synced = await getSyncedState(userId);
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

  let dek = removedSomeone || !synced ? null : await getDek(userId);
  if (!dek) {
    dek = crypto.getRandomValues(new Uint8Array(DEK_LENGTH));
    await setDek(userId, dek);
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

export async function commitReconciliation(
  userId: string,
  plan: ReconciliationPlan,
): Promise<void> {
  if (plan.kind === 'noop') return;
  await setSyncedState(userId, plan.nextState);
}

/**
 * The other side of `planReconciliation`: when acting as a trusted
 * contact, opens a share an owner has sealed for this device and caches
 * it decrypted, kept ready for whenever that owner actually needs it back
 * (see `sealShareForRecoveryRequest`). Silently does nothing on a share
 * that isn't actually ours to open (a stale/foreign blob, or no identity
 * keypair yet) rather than throwing, since this runs opportunistically off
 * list refreshes and realtime events, not a user action.
 */
export async function receiveShare(
  forUserId: string,
  ownerId: string,
  sealedHex: string,
): Promise<boolean> {
  const identity = await getIdentityKeypair(forUserId);
  if (!identity) return false;

  try {
    const plaintext = unseal(sealedHex, identity.privateKey);
    const envelope = JSON.parse(new TextDecoder().decode(plaintext)) as {
      generation: number;
      threshold: number;
      share: string;
    };
    await setReceivedShare(forUserId, ownerId, {
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
 * The actual hand-back, when acting as a trusted contact approving a
 * recovery request: re-seals this device's already-held plaintext share
 * (cached by `receiveShare`) to the *requesting device's* public key,
 * in the exact same `{generation, threshold, share}` envelope shape the
 * owner originally sealed - `completeRecovery` on the other end expects
 * to find that shape. `null` if this device never actually held a share
 * for that owner (nothing to approve with).
 */
export async function sealShareForRecoveryRequest(
  forUserId: string,
  ownerId: string,
  requestingDevicePublicKeyHex: string,
): Promise<string | null> {
  const share = await getReceivedShare(forUserId, ownerId);
  if (!share) return null;

  const envelope = JSON.stringify({
    generation: share.generation,
    threshold: share.threshold,
    share: bytesToHex(share.share),
  });
  return seal(new TextEncoder().encode(envelope), hexToBytes(requestingDevicePublicKeyHex));
}

/**
 * The own-device counterpart of `receiveShare`: opens a full DEK copy a
 * sibling device has sealed for this one and adopts it directly, no
 * quorum involved. Also adopts the sender's synced state verbatim (same
 * `generation`/`contactIds`/`ownDeviceIds`), so this device's own next
 * reconciliation pass sees itself as already caught up instead of
 * mistaking a fresh sync for a change that needs rotating again.
 */
export async function receiveDek(userId: string, sealedHex: string): Promise<boolean> {
  const identity = await getIdentityKeypair(userId);
  if (!identity) return false;

  try {
    const plaintext = unseal(sealedHex, identity.privateKey);
    const envelope = JSON.parse(new TextDecoder().decode(plaintext)) as {
      generation: number;
      contactIds: string[];
      ownDeviceIds: string[];
      dek: string;
    };
    await setDek(userId, hexToBytes(envelope.dek));
    await setSyncedState(userId, {
      contactIds: envelope.contactIds,
      ownDeviceIds: envelope.ownDeviceIds,
      generation: envelope.generation,
    });
    return true;
  } catch {
    return false;
  }
}

export interface RecoveryRequestShare {
  encryptedShare: string;
}

/**
 * Unseals every share this device's identity key can open, surfacing each
 * one's own `{generation, threshold, share}` envelope - shared by
 * `completeRecovery` (which combines them) and `peekRecoveryThreshold`
 * (which only needs to read `threshold` off of one, without needing
 * `threshold`-many to combine anything).
 */
async function openShares(
  userId: string,
  shares: RecoveryRequestShare[],
): Promise<{ generation: number; threshold: number; share: Uint8Array }[]> {
  const identity = await getIdentityKeypair(userId);
  if (!identity) return [];

  const opened: { generation: number; threshold: number; share: Uint8Array }[] = [];
  for (const { encryptedShare } of shares) {
    try {
      const plaintext = unseal(encryptedShare, identity.privateKey);
      const envelope = JSON.parse(new TextDecoder().decode(plaintext)) as {
        generation: number;
        threshold: number;
        share: string;
      };
      opened.push({
        generation: envelope.generation,
        threshold: envelope.threshold,
        share: hexToBytes(envelope.share),
      });
    } catch {
      // Not sealed to this device, or corrupt - skip rather than abort the
      // whole batch over one bad entry.
    }
  }
  return opened;
}

/**
 * Reads the Shamir threshold off of any one already-approved,
 * successfully-unsealed share - without needing `threshold`-many of them
 * to actually reconstruct anything. This is the one thing that lets a
 * device recognize a recovery request has become impossible to complete
 * *before* every contact has responded (see `recoveryRequest.ts`'s own
 * doc comment on why the server can't): once this is known, comparing it
 * against `approvedContacts + stillPending` tells you whether the
 * remaining pending contacts could still save it, without waiting for
 * them to actually respond.
 *
 * Returns `null` until at least one share has been approved and
 * released - nobody (server included) knows the threshold before that,
 * since it only ever lives inside each sealed envelope.
 */
export async function peekRecoveryThreshold(
  userId: string,
  shares: RecoveryRequestShare[],
): Promise<number | null> {
  const opened = await openShares(userId, shares);
  return opened[0]?.threshold ?? null;
}

/**
 * The trusted-contacts counterpart of `receiveDek`: once the server starts
 * returning sealed shares for an in-flight recovery request (see
 * `GET /me/recovery-requests/{id}/shares`, gated server-side by the
 * mandatory delay), this opens each one with this device's own private
 * key and, as soon as enough of the same generation are open, reconstructs
 * the DEK - exactly how the device learns the Shamir threshold, since the
 * server was never told it (it only ever lives inside each sealed
 * envelope, same as `receiveShare`).
 *
 * A single accepted contact never went through a real Shamir split (see
 * `planReconciliation`'s own doc comment: `threshold: 1` just means the
 * raw DEK was sealed directly) - so a lone opened share for that
 * generation *is* the DEK, no `combine` call needed or correct to make.
 *
 * **Critical**: commits `setDek` *and* `setSyncedState` together, exactly
 * like `receiveDek` does - `planReconciliation` treats "no local synced
 * state" as license to mint a brand-new random DEK
 * (`let dek = removedSomeone || !synced ? null : await getDek(userId)`), which on
 * a freshly-recovered device would silently discard the key this function
 * just spent a whole recovery request recovering. Setting both first, with
 * `eligibleContactIds`/`ownDeviceIds` matching the account's *current*
 * eligible sets (fetched the same way `useRecoveryKeySync` already does),
 * makes the very next reconciliation pass see "already in sync" - a
 * correct no-op - instead of rotating away the recovered key.
 */
export async function completeRecovery(
  userId: string,
  shares: RecoveryRequestShare[],
  eligibleContactIds: string[],
  ownDeviceIds: string[],
): Promise<boolean> {
  const opened = await openShares(userId, shares);

  // Only same-generation shares combine meaningfully - a mixed batch would
  // only happen if a rotation somehow raced an in-flight recovery, which
  // shouldn't be possible (see `recoveryRequest.ts`'s own doc comment), but
  // grouping defensively costs nothing.
  const byGeneration = new Map<number, typeof opened>();
  for (const entry of opened) {
    byGeneration.set(entry.generation, [...(byGeneration.get(entry.generation) ?? []), entry]);
  }

  for (const [generation, group] of byGeneration) {
    const threshold = group[0].threshold;
    if (group.length < threshold) continue;

    const dek =
      threshold === 1
        ? group[0].share
        : await ShamirSecretSharing.combine(group.slice(0, threshold).map((entry) => entry.share));

    await setDek(userId, dek);
    await setSyncedState(userId, { contactIds: eligibleContactIds, ownDeviceIds, generation });
    return true;
  }

  return false;
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
export async function getDebugSnapshot(userId: string): Promise<RecoveryKeyDebugSnapshot> {
  const [identity, dek, syncedState] = await Promise.all([
    getIdentityKeypair(userId),
    getDek(userId),
    getSyncedState(userId),
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
export async function getReceivedShareDebugInfo(
  forUserId: string,
  ownerId: string,
): Promise<ReceivedShareDebugInfo> {
  const share = await getReceivedShare(forUserId, ownerId);
  if (!share) return { present: false, generation: null, threshold: null };
  return { present: true, generation: share.generation, threshold: share.threshold };
}
