import { describe, expect, it } from 'bun:test';
import { REPORT_FAMILIES, REPORT_TYPES, REPORT_TYPE_KEYS, UNKNOWN_WIRE_CODE } from './reports';

/**
 * Covers only what this lib owns - the keys, their families and their wire
 * codes. Every consumer asserts its own coverage instead: labels in
 * `libs/i18n/src/lib/reportLabels.spec.ts`, and the key-to-icon mapping at
 * compile time via `satisfies Record<ReportTypeKey, string>` in
 * `apps/mobile/src/constants/assets.ts`.
 */

describe('report taxonomy', () => {
  it('keeps wire codes unique, in range, and clear of the unknown marker', () => {
    const codes = REPORT_TYPE_KEYS.map((key) => REPORT_TYPES[key].wire);

    expect(new Set(codes).size).toBe(codes.length);
    expect(codes.filter((code) => code < 0 || code > 254)).toEqual([]);
    expect(codes).not.toContain(UNKNOWN_WIRE_CODE);
  });

  it('keeps the nine originally shipped wire codes pinned', () => {
    // Reordering these silently reinterprets every report relayed by a peer on
    // an older build - the mesh decodes by number, not by name.
    expect(
      (
        [
          'tear_gas',
          'police_presence',
          'arrest',
          'violence',
          'road_block',
          'medical',
          'water_cannon',
          'kettling',
          'other',
        ] as const
      ).map((key) => REPORT_TYPES[key].wire),
    ).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('puts every type in a declared family', () => {
    const families = new Set<string>(REPORT_FAMILIES);
    expect(REPORT_TYPE_KEYS.filter((key) => !families.has(REPORT_TYPES[key].family))).toEqual([]);
  });
});
