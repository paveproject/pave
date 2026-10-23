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
// A 3rd path (see `mnemonicSeal.ts`) seals a copy of the same DEK under a
// key derived from a 24-word recovery phrase, uploaded as an opaque,
// account-level (not device-level) blob - `useReconcileMnemonicUpload`
// keeps it current whenever the DEK changes, from whichever device holds
// the cached derived key.
import * as ShamirSecretSharing from 'shamir-secret-sharing';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { generateIdentityKeypair, seal, unseal } from './seal';
import {
  deriveMnemonicDerivedKey,
  sealWithMnemonicKey,
  unsealWithMnemonicKey,
} from './mnemonicSeal';
import {
  getDek,
  getIdentityKeypair,
  getMnemonicDerivedKey,
  getMnemonicUploadedFingerprint,
  getReceivedShare,
  getSyncedState,
  setDek,
  setIdentityKeypair,
  setMnemonicDerivedKey,
  setMnemonicUploadedFingerprint,
  setReceivedShare,
  setSyncedState,
  type RecoveryKeySyncState,
} from './storage';

export { generateRecoveryMnemonic, isValidRecoveryMnemonic } from './mnemonicSeal';
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
 * and excludes "self" using its own `thisDeviceId` parameter.
 *
 * `isActive` matters: a `pending`/`suspended` device is excluded from
 * every DEK-bearing set `planReconciliation` produces (never sealed to,
 * never counted in `ownDeviceIds`) until it's actually trusted - approval
 * is the real gate for DEK confidentiality, not a decoration on top of a
 * reconciliation pass that hands out the key regardless. */
export interface OwnDevice {
  deviceId: string;
  publicKey: string;
  isActive: boolean;
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
      /** Not yet persisted - see `commitReconciliation`. Computing a
       * plan must never have a side effect on local storage on its own;
       * only committing one does, so a caller that reserves a generation
       * and loses can walk away having changed nothing locally. */
      dek: Uint8Array;
      shareUploads: ShareUpload[];
      deviceDekUploads: DeviceDekUpload[];
      nextState: RecoveryKeySyncState;
      /** True when this plan mints a brand-new DEK (a removal, or no
       * prior sync at all) - the one case where two of this account's
       * own active devices reacting to the same event could each mint a
       * *different* key with no way to tell afterward. `false` for a
       * pure addition, which re-seals the *existing* DEK under a larger
       * set - nothing random is being generated, so there's nothing to
       * race on.
       *
       * When `true`, the caller MUST win a reservation (see
       * `reserve_recovery_dek_generation`, called with
       * `previousGeneration` as `expectedGeneration`) before uploading
       * anything in this plan. Losing it means some other device already
       * won the identical rotation and will seal its result to this
       * device shortly (`receiveDek`) - this plan must be abandoned
       * outright, not retried with the same (now-orphaned) DEK. */
      needsGenerationReservation: boolean;
      previousGeneration: number;
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

/**
 * Bootstraps a DEK for the mandatory recovery-phrase welcome step, which
 * runs before this account necessarily has any trusted contact or sibling
 * device - `planReconciliation` below only ever mints one once at least
 * one of those exists, so without this, a brand-new account's first
 * device would have nothing yet for the phrase to seal.
 *
 * Reuses an existing DEK if one's already there (nothing to do). Seeds a
 * matching `syncedState` baseline *only if none exists yet* - critical:
 * without it, the next real reconciliation pass (first contact or second
 * device) would see "no prior sync" and mint a *second*, different DEK,
 * silently discarding the one the phrase just protected (the same
 * landmine `receiveDek`/`completeRecovery`'s own doc comments already
 * guard against for their own cases).
 */
export async function ensureDekForMnemonicSetup(
  userId: string,
  thisDeviceId: string,
): Promise<Uint8Array> {
  const existing = await getDek(userId);
  if (existing) return existing;

  const dek = crypto.getRandomValues(new Uint8Array(DEK_LENGTH));
  await setDek(userId, dek);
  if (!(await getSyncedState(userId))) {
    await setSyncedState(userId, { contactIds: [], ownDeviceIds: [thisDeviceId], generation: 0 });
  }
  return dek;
}

export interface MnemonicUploadPlan {
  encryptedDek: string;
  dekFingerprint: string;
}

/**
 * Whether this device needs to (re-)upload the account's recovery-phrase
 * blob - `null` when there's nothing to do: no cached derived key (this
 * isn't the device that set up/last confirmed the phrase), no DEK yet, or
 * the DEK hasn't changed since this device's last successful upload.
 *
 * Call this after *any* point the local DEK may have changed - not just
 * this device's own rotations (see `useRecoveryKeySync`), but also after
 * adopting one a sibling pushed (`receiveDek`) or one just reconstructed
 * via trusted-contacts quorum (`completeRecovery`) - this device's cached
 * mnemonic key, if it has one, must stay in sync regardless of which of
 * those drove the change.
 */
export async function planMnemonicUpload(userId: string): Promise<MnemonicUploadPlan | null> {
  const [derivedKey, dek] = await Promise.all([getMnemonicDerivedKey(userId), getDek(userId)]);
  if (!derivedKey || !dek) return null;

  const dekFingerprint = bytesToHex(sha256(dek)).slice(0, 16);
  if ((await getMnemonicUploadedFingerprint(userId)) === dekFingerprint) return null;

  return { encryptedDek: sealWithMnemonicKey(dek, derivedKey), dekFingerprint };
}

/** Records that `dekFingerprint` has been uploaded, so the next
 * `planMnemonicUpload` call is a no-op until the DEK changes again. */
export async function commitMnemonicUpload(userId: string, dekFingerprint: string): Promise<void> {
  await setMnemonicUploadedFingerprint(userId, dekFingerprint);
}

export interface MnemonicSetupPlan {
  encryptedDek: string;
  derivedKey: Uint8Array;
  dekFingerprint: string;
}

/** The welcome flow's one-time setup: ensures a DEK exists (see
 * `ensureDekForMnemonicSetup`), derives this phrase's key, and seals the
 * DEK with it. The caller uploads `encryptedDek` itself (a network call,
 * kept out of this module - see `planReconciliation`'s own separation),
 * then calls `commitMnemonicSetup` with the rest of this plan. */
export async function planMnemonicSetup(
  userId: string,
  thisDeviceId: string,
  mnemonic: string,
): Promise<MnemonicSetupPlan> {
  const dek = await ensureDekForMnemonicSetup(userId, thisDeviceId);
  const derivedKey = deriveMnemonicDerivedKey(mnemonic);
  const encryptedDek = sealWithMnemonicKey(dek, derivedKey);
  const dekFingerprint = bytesToHex(sha256(dek)).slice(0, 16);
  return { encryptedDek, derivedKey, dekFingerprint };
}

/** Caches the derived key (so this device re-uploads on future rotations
 * - see `planMnemonicUpload`) and records the DEK it was just uploaded
 * for, once `encryptedDek` has actually reached the server. */
export async function commitMnemonicSetup(
  userId: string,
  derivedKey: Uint8Array,
  dekFingerprint: string,
): Promise<void> {
  await setMnemonicDerivedKey(userId, derivedKey);
  await setMnemonicUploadedFingerprint(userId, dekFingerprint);
}

/**
 * Decrypts a fetched recovery-key-mnemonic blob - throws (AEAD auth
 * failure) on a wrong phrase, before any network call commits to it.
 */
export function decryptDekWithMnemonic(sealedHex: string, mnemonic: string): Uint8Array {
  return unsealWithMnemonicKey(sealedHex, deriveMnemonicDerivedKey(mnemonic));
}

/** Adopts a DEK recovered via the mnemonic path immediately, before the
 * server-side activation call - mirrors `receiveDek`/`completeRecovery`'s
 * own "commit the DEK as soon as it's known" ordering.
 *
 * Also seeds a minimal `syncedState` baseline *if none exists yet* (same
 * guard as `ensureDekForMnemonicSetup`). Without this, an app kill between
 * this call and `finalizeMnemonicRecovery`'s own real `setSyncedState`
 * (which needs a network round-trip first, to learn the account's current
 * eligible contacts/devices) would leave `synced: null` with a real DEK
 * already in storage - and `planReconciliation` treats `synced === null`
 * as license to mint a *brand-new* random DEK, discarding the one just
 * recovered. The baseline only ever claims this device itself;
 * `finalizeMnemonicRecovery` upgrades it to the real eligible sets once
 * they're known, and in the meantime `planReconciliation` sees this
 * device's own id already present and reuses the existing DEK instead of
 * rotating. */
export async function adoptMnemonicDek(
  userId: string,
  dek: Uint8Array,
  thisDeviceId: string,
): Promise<void> {
  await setDek(userId, dek);
  if (!(await getSyncedState(userId))) {
    await setSyncedState(userId, { contactIds: [], ownDeviceIds: [thisDeviceId], generation: 0 });
  }
}

/**
 * The second half, run only after `POST .../activate` has succeeded and
 * the account's current eligible contacts/own-devices have been
 * refetched. Seeds a matching `syncedState` baseline - without it, this
 * device's very next reconciliation pass would see "no prior sync" and
 * mint a *second*, different DEK (the same landmine
 * `ensureDekForMnemonicSetup`'s own doc comment guards against). Also
 * caches this phrase's derived key: this device just "re-confirmed" it,
 * so it becomes the new upload-responsible device going forward (see
 * `planMnemonicUpload`).
 */
export async function finalizeMnemonicRecovery(
  userId: string,
  dek: Uint8Array,
  mnemonic: string,
  eligibleContactIds: string[],
  ownDeviceIds: string[],
): Promise<void> {
  await setSyncedState(userId, { contactIds: eligibleContactIds, ownDeviceIds, generation: 0 });
  const derivedKey = deriveMnemonicDerivedKey(mnemonic);
  const dekFingerprint = bytesToHex(sha256(dek)).slice(0, 16);
  await setMnemonicDerivedKey(userId, derivedKey);
  await setMnemonicUploadedFingerprint(userId, dekFingerprint);
}

function sameSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sorted = [...b].sort();
  return [...a].sort().every((id, i) => id === sorted[i]);
}

/**
 * Decides whether the recovery key needs (re-)splitting/resyncing for the
 * given accepted contacts and own other devices, and if so, produces the
 * new sealed uploads for both. A pure computation - nothing here touches
 * local storage; see `dek`/`commitReconciliation` on `ReconciliationPlan`
 * for why, and `needsGenerationReservation` for the one thing a caller
 * must do (win a server-side reservation) before calling
 * `commitReconciliation` or uploading anything in a `rotate` plan where
 * it's `true`.
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
 *
 * A sibling only counts - for `ownDeviceIds` and for actually receiving a
 * sealed copy - once it's `isActive`. A `pending` device is already a
 * real row (it registered before anyone approved it) and a `suspended`
 * one is a row a recovery path deliberately locked out; neither has
 * earned the DEK yet. This device itself always counts regardless of
 * what its own row says *right now* (a completing recovery flow calls
 * this before the server has been told it's `active` again) - it isn't
 * waiting on anyone else's approval, it already has the plaintext DEK in
 * hand by the time this runs.
 */
export async function planReconciliation(
  userId: string,
  accepted: AcceptedContact[],
  allOwnDevices: OwnDevice[],
  thisDeviceId: string,
): Promise<ReconciliationPlan> {
  const eligible = accepted.filter((contact) => contact.contactDevices.length > 0);
  const eligibleIds = eligible.map((contact) => contact.contactUserId);
  const trustedOwnDevices = allOwnDevices.filter(
    (device) => device.isActive || device.deviceId === thisDeviceId,
  );
  const ownDeviceIds = trustedOwnDevices.map((device) => device.deviceId);
  const siblingDevices = trustedOwnDevices.filter((device) => device.deviceId !== thisDeviceId);

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

  // Reuse the existing DEK only when nothing was removed and a prior
  // sync actually exists - otherwise mint fresh. If that reuse case
  // somehow finds no local DEK anyway (storage wiped/corrupted despite
  // `synced` still claiming otherwise), fall through to minting rather
  // than throwing - but still through the *same* gated path below, not
  // a silent ungated mint: an inconsistency like that could just as
  // easily be hit by a sibling device at the same time.
  const reusableDek = removedSomeone || !synced ? null : await getDek(userId);
  const mintsNewDek = !reusableDek;
  // Not persisted here - a freshly-minted candidate stays a local
  // variable until `commitReconciliation` actually commits to it. A
  // device that computes this plan, loses the generation reservation
  // below to a sibling doing the exact same thing, and abandons the
  // plan must come out of this having changed nothing locally - storing
  // it eagerly here would clobber this device's own DEK with a losing
  // candidate regardless of how the race turns out.
  const dek = reusableDek ?? crypto.getRandomValues(new Uint8Array(DEK_LENGTH));

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
    dek,
    shareUploads,
    deviceDekUploads,
    nextState: { contactIds: eligibleIds, ownDeviceIds, generation },
    needsGenerationReservation: mintsNewDek,
    previousGeneration: synced?.generation ?? 0,
  };
}

/** Persists what `planReconciliation` only computed - see `dek`'s own
 * doc comment on `ReconciliationPlan` for why committing, not planning,
 * is where local storage actually changes. Same order
 * `receiveDek`/`completeRecovery` already use (DEK, then synced state,
 * back to back, no network call or other await in between) - an app
 * kill between the two still leaves this device able to recognize "my
 * own state is incomplete" and retry correctly on next launch, rather
 * than silently rotating away a DEK it already committed to uploading. */
export async function commitReconciliation(
  userId: string,
  plan: ReconciliationPlan,
): Promise<void> {
  if (plan.kind === 'noop') return;
  await setDek(userId, plan.dek);
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
