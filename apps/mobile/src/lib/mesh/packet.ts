import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import type { ReportType } from '@libs/api-js';

/** Bumped only if the wire format changes - lets a future version reject
 * (not crash on) a packet from an older/newer build instead of
 * misinterpreting its bytes. */
export const MESH_PACKET_VERSION = 1;

/** Fixed, not adaptive (see this module's own "out of scope for v1" note
 * in the implementation plan) - every packet starts here and loses one
 * hop per relay. */
export const MESH_INITIAL_TTL = 5;

/** Index position *is* the wire value - order must never change once
 * shipped, only ever appended to (a reordering would silently reinterpret
 * every report type a relayed-but-not-yet-upgraded peer sends). */
const REPORT_TYPES: readonly ReportType[] = [
  'tear_gas',
  'police_presence',
  'arrest',
  'violence',
  'road_block',
  'medical',
  'water_cannon',
  'kettling',
  'other',
];

export interface MeshPacket {
  version: number;
  type: ReportType;
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

  const typeIndex = REPORT_TYPES.indexOf(packet.type);
  view.setUint8(offset, typeIndex);
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
 * index - callers must silently drop malformed/foreign BLE traffic, not
 * crash the relay loop over it. */
export const decodeMeshPacket = (bytes: Uint8Array): MeshPacket | null => {
  if (bytes.length !== PACKET_LENGTH) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  const version = view.getUint8(offset);
  offset += 1;
  if (version !== MESH_PACKET_VERSION) return null;

  const typeIndex = view.getUint8(offset);
  offset += 1;
  const type = REPORT_TYPES[typeIndex];
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
