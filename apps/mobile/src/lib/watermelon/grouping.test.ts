import { groupReports, GROUP_RADIUS_METERS, type GroupableReport } from './grouping';

const report = (
  id: string,
  type: string,
  lat: number,
  lng: number,
  occurredAtMs: number,
): GroupableReport => ({
  id,
  type,
  lat,
  lng,
  occurredAt: new Date(occurredAtMs),
});

describe('groupReports', () => {
  it('merges GPS jitter of the same event', () => {
    // ~8m apart at Paris latitude - well within typical open-sky GPS noise.
    const reports = [
      report('a', 'tear_gas', 48.8566, 2.3522, 100_000),
      report('b', 'tear_gas', 48.85665, 2.35225, 200_000),
    ];

    const grouped = groupReports(reports, GROUP_RADIUS_METERS);

    expect(grouped).toHaveLength(1);
    expect(grouped[0].count).toBe(2);
    expect(grouped[0].id).toBe('b'); // most recent occurredAt
  });

  it('keeps two distinct streets separate', () => {
    // ~28m apart at Paris latitude - beyond the 20m radius.
    const reports = [
      report('a', 'tear_gas', 48.8566, 2.3522, 100_000),
      report('b', 'tear_gas', 48.85685, 2.3522, 200_000),
    ];

    const grouped = groupReports(reports, GROUP_RADIUS_METERS);

    expect(grouped).toHaveLength(2);
    expect(grouped.every((r) => r.count === 1)).toBe(true);
  });

  it('never merges across types', () => {
    const reports = [
      report('a', 'tear_gas', 48.8566, 2.3522, 100_000),
      report('b', 'violence', 48.8566, 2.3522, 200_000),
    ];

    const grouped = groupReports(reports, GROUP_RADIUS_METERS);

    expect(grouped).toHaveLength(2);
  });

  it('returns an empty array for no reports', () => {
    expect(groupReports([], GROUP_RADIUS_METERS)).toEqual([]);
  });
});
