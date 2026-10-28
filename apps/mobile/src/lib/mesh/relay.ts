import type { MeshEnvelope } from './packet';

/** Comfortably longer than any plausible multi-hop relay window, short
 * enough to bound memory. In-memory, module-level, not persisted -
 * resetting on relaunch just costs one harmless extra relay (the same
 * "redundant re-send is safe" property the rest of the sync system
 * already leans on), so there's no need for a background eviction timer
 * either - eviction happens lazily on each insert. */
const SEEN_TTL_MS = 10 * 60 * 1000;

const seen = new Map<string, number>();

const evictExpired = (): void => {
  const cutoff = Date.now() - SEEN_TTL_MS;
  for (const [reportId, seenAtMs] of seen) {
    if (seenAtMs < cutoff) seen.delete(reportId);
  }
};

export interface RelayDecision {
  /** First time seeing this reportId - write it locally + push to the
   * server via the normal outbox. */
  shouldProcessLocally: boolean;
  /** Worth forwarding to other mesh peers - not already seen, and the
   * decremented TTL hasn't hit zero. */
  shouldRebroadcast: boolean;
}

/** Call once per received packet, before acting on it. Dedup key is the
 * report's own UUID (`packet.reportId`) - no separate message-id/LRU
 * scheme needed, see `packet.ts`'s own doc comment. */
export const decideRelay = (packet: MeshEnvelope): RelayDecision => {
  evictExpired();
  const alreadySeen = seen.has(packet.reportId);
  const nextTtl = packet.ttl - 1;
  return {
    shouldProcessLocally: !alreadySeen,
    shouldRebroadcast: !alreadySeen && nextTtl > 0,
  };
};

/** Record a reportId as handled - call after actually processing/
 * forwarding it, not before (so a decode/process failure doesn't
 * silently poison the dedup cache against a legitimate retry). */
export const markSeen = (reportId: string): void => {
  seen.set(reportId, Date.now());
};

/** For the debug screen - not a correctness-critical read. */
export const getSeenCacheSize = (): number => seen.size;

/** BitChat's own 10-220ms jitter range - staggers simultaneous relays of
 * the same packet by multiple nearby peers, so they don't all rebroadcast
 * in the same instant and create a broadcast storm. */
export const rebroadcastJitterMs = (): number => 10 + Math.random() * 210;
