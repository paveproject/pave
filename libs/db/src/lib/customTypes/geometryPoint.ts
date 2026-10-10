import { customType } from 'drizzle-orm/pg-core';

/**
 * drizzle-orm's own `geometry()` column helper (drizzle-orm/pg-core) hardcodes
 * `geometry(point)` in its generated DDL with no SRID, regardless of the
 * `srid`/`type` config passed to it - that config is accepted by the
 * TypeScript API but silently ignored when generating migrations (checked
 * against drizzle-orm 0.45.4's source). PostGIS needs a declared SRID for
 * correct distance/containment queries (`ST_DWithin`, etc.), so this is a
 * `customType` instead, fixed to WGS84 (SRID 4326 - plain lat/lng) since
 * that's the only CRS this app needs.
 */
export const geometryPoint = (name: string) =>
  customType<{ data: { x: number; y: number }; driverData: string }>({
    dataType() {
      return 'geometry(Point, 4326)';
    },
    toDriver(value) {
      return `SRID=4326;POINT(${value.x} ${value.y})`;
    },
    fromDriver(value) {
      return parsePointEWKB(value);
    },
  })(name);

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Decodes the (E)WKB hex string PostGIS returns for a `geometry(Point, *)`
 * column - the wire format is the same whether or not the column declares an
 * SRID, only whether the SRID-present flag bit (0x20000000) is set on the
 * geometry type word.
 */
function parsePointEWKB(hex: string): { x: number; y: number } {
  const bytes = hexToBytes(hex);
  const view = new DataView(bytes.buffer);
  const littleEndian = bytes[0] === 1;
  const geomType = view.getUint32(1, littleEndian);
  const hasSrid = (geomType & 0x20000000) !== 0;
  const offset = hasSrid ? 9 : 5;
  return {
    x: view.getFloat64(offset, littleEndian),
    y: view.getFloat64(offset + 8, littleEndian),
  };
}
