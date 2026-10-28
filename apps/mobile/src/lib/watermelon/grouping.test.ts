import { groupReports, type GroupableReport } from './grouping';

/**
 * These guard the half of the rule the API can't: the app groups local and
 * mesh-relayed reports onto the same map as the server's, so a divergence
 * shows up as two different clusterings at one zoom.
 */

const at = (id: string, type: string, lat: number, lng: number): GroupableReport => ({
  id,
  type,
  lat,
  lng,
  occurredAt: new Date('2026-10-28T12:00:00Z'),
});

/** ~900m wide: just under the family handover, so markers are typed. */
const STREET = { minLng: 2.3516, maxLng: 2.3616 };
/** ~10km wide: comfortably into family territory. */
const CITY = { minLng: 2.24, maxLng: 2.43 };

describe('groupReports', () => {
  it('collapses same-type reports sharing a cell', () => {
    const grouped = groupReports(
      [
        at('a', 'tear_gas', 48.8566, 2.3522),
        at('b', 'tear_gas', 48.85665, 2.35225),
        at('c', 'tear_gas', 48.8567, 2.3523),
      ],
      STREET,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(3);
    expect(grouped[0].type).toBe('tear_gas');
    expect(grouped[0].kind).toBe('type');
  });

  it('keeps different types apart when zoomed in', () => {
    const grouped = groupReports(
      [at('a', 'tear_gas', 48.8566, 2.3522), at('b', 'medical', 48.8566, 2.3522)],
      STREET,
    );

    expect(grouped).toHaveLength(2);
  });

  it('merges different types of one family into a family marker when zoomed out', () => {
    const grouped = groupReports(
      [
        at('a', 'tear_gas', 48.8566, 2.3522),
        at('b', 'water_cannon', 48.8567, 2.3523),
        at('c', 'tear_gas', 48.8568, 2.3524),
      ],
      CITY,
    );

    expect(grouped).toHaveLength(1);
    expect(grouped[0].kind).toBe('family');
    expect(grouped[0].type).toBe('force_used');
    expect(grouped[0].count).toBe(3);
  });

  it('still names the type when a zoomed-out cell holds only one', () => {
    // The whole point of the fallback: "Aid, 1" says less than "Medical, 1".
    const grouped = groupReports([at('a', 'medical', 48.8566, 2.3522)], CITY);

    expect(grouped[0].kind).toBe('type');
    expect(grouped[0].type).toBe('medical');
    expect(grouped[0].id).toBe('a');
  });

  it('separates reports far enough apart to land in different cells', () => {
    const grouped = groupReports(
      [at('a', 'tear_gas', 48.8566, 2.3522), at('b', 'tear_gas', 48.8566, 2.42)],
      STREET,
    );

    expect(grouped).toHaveLength(2);
  });

  it('keeps a type this build does not know rather than dropping it', () => {
    // A newer peer can relay a type that has no family here.
    const grouped = groupReports([at('a', 'not_a_known_type', 48.8566, 2.3522)], CITY);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].type).toBe('not_a_known_type');
  });

  it('returns nothing for no reports', () => {
    expect(groupReports([], STREET)).toEqual([]);
  });
});
