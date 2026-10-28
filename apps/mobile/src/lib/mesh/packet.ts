import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import {
  REPORT_TYPE_BY_WIRE_CODE,
  REPORT_TYPE_WIRE_CODES,
  UNKNOWN_WIRE_CODE,
  type ReportTypeKey,
} from '@libs/constants';

/** Bumped only if the wire format changes - lets a future version reject
 * (not crash on) a packet from an older/newer build instead of
 * misinterpreting its bytes. */
export const MESH_PACKET_VERSION = 1;

/** Fixed, not adaptive (see this module's own "out of scope for v1" note
 * in the implementation plan) - every packet starts here and loses one
 * hop per relay. */
export const MESH_INITIAL_TTL = 5;

export interface MeshPacket {
  version: number;
  type: ReportTypeKey;
  ttl: number;
  /** The report's own client-generated UUID (see
   * `lib/watermelon/reports.ts`) - doubles as the mesh dedup key, no
   * separate message-id scheme needed. */
  reportId: string;
  lat: number;
  lng: number;
  occurredAt: Date;
}

const PACKET_LENGTH = 1 + 1 + 1 + 16 + 4 + 4 + 8; // version, type, ttl, reportId, lat, lng, occurredAt

const OFFSET_VERSION = 0;
const OFFSET_TYPE = 1;
const OFFSET_TTL = 2;
const OFFSET_REPORT_ID = 3;

const uuidToBytes = (uuid: string): Uint8Array => hexToBytes(uuid.replace(/-/g, ''));

const bytesToUuid = (bytes: Uint8Array): string => {
  const hex = bytesToHex(bytes);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

/** Fixed 35-byte binary layout, well under a single BLE characteristic
 * write - no fragmentation/reassembly needed for v1 (see the
 * implementation plan's "out of scope" section). */
export const encodeMeshPacket = (packet: MeshPacket): Uint8Array => {
  const buffer = new ArrayBuffer(PACKET_LENGTH);
  const view = new DataView(buffer);
  let offset = 0;

  view.setUint8(offset, packet.version);
  offset += 1;

  view.setUint8(offset, REPORT_TYPE_WIRE_CODES[packet.type] ?? UNKNOWN_WIRE_CODE);
  offset += 1;

  view.setUint8(offset, packet.ttl);
  offset += 1;

  new Uint8Array(buffer, offset, 16).set(uuidToBytes(packet.reportId));
  offset += 16;

  view.setFloat32(offset, packet.lat);
  offset += 4;

  view.setFloat32(offset, packet.lng);
  offset += 4;

  view.setBigInt64(offset, BigInt(packet.occurredAt.getTime()));
  offset += 8;

  return new Uint8Array(buffer);
};

/** `null` (never throws) on a bad version, wrong length, or unknown type
 * code - callers must silently drop malformed/foreign BLE traffic, not
 * crash the relay loop over it. */
export const decodeMeshPacket = (bytes: Uint8Array): MeshPacket | null => {
  if (bytes.length !== PACKET_LENGTH) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const version = view.getUint8(offset);
  offset += 1;
  if (version !== MESH_PACKET_VERSION) return null;

  const typeCode = view.getUint8(offset);
  offset += 1;
  const type = REPORT_TYPE_BY_WIRE_CODE.get(typeCode);
  // An OTA is scoped to a runtimeVersion, so a peer can legitimately be running
  // a build whose taxonomy has types this one doesn't. `null` here only skips
  // the local ingest - `useMeshRelay` still forwards the raw bytes.
  if (!type) return null;

  const ttl = view.getUint8(offset);
  offset += 1;

  const reportId = bytesToUuid(bytes.slice(offset, offset + 16));
  offset += 16;

  const lat = view.getFloat32(offset);
  offset += 4;

  const lng = view.getFloat32(offset);
  offset += 4;

  const occurredAt = new Date(Number(view.getBigInt64(offset)));
  offset += 8;

  return { version, type, ttl, reportId, lat, lng, occurredAt };
};

/** The fields readable without knowing the report type. Enough to dedup and
 * forward a packet this build can't interpret. */
export interface MeshEnvelope {
  version: number;
  ttl: number;
  reportId: string;
}

/** Separate from `decodeMeshPacket` so an unknown type code stops the local
 * ingest without stopping the relay - dropping the packet instead would mean
 * a report of a newly added type can't cross a device that hasn't updated. */
export const decodeMeshEnvelope = (bytes: Uint8Array): MeshEnvelope | null => {
  if (bytes.length !== PACKET_LENGTH) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(OFFSET_VERSION);
  if (version !== MESH_PACKET_VERSION) return null;

  return {
    version,
    ttl: view.getUint8(OFFSET_TTL),
    reportId: bytesToUuid(bytes.slice(OFFSET_REPORT_ID, OFFSET_REPORT_ID + 16)),
  };
};

/** The received bytes with one hop taken off, forwarded verbatim otherwise.
 * Never re-encode from a decoded packet to relay: an unknown type would come
 * back out as `other`, destroying the real type for every peer downstream. */
export const relayBytes = (bytes: Uint8Array): Uint8Array => {
  const out = new Uint8Array(bytes);
  out[OFFSET_TTL] = bytes[OFFSET_TTL] - 1;
  return out;
};
