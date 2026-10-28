import { describe, expect, it } from 'bun:test';
import { REPORT_FAMILIES, REPORT_TYPE_KEYS } from '@libs/constants';
import frFR from './dictionaries/fr-FR.json';
import enUS from './dictionaries/en-US.json';

/**
 * Lives here, not in libs/constants: the taxonomy owns the keys, and each
 * consumer asserts its own coverage of them. A type added without a label
 * fails this suite instead of rendering a missing-message error in the picker.
 */

type Dict = {
  pages: {
    map: { report: { families: Record<string, string>; types: Record<string, string> } };
  };
};

const labelsFor = (dict: Dict) => dict.pages.map.report.types;
const familyLabelsFor = (dict: Dict) => dict.pages.map.report.families;

describe('report type labels', () => {
  it('covers every report type in fr-FR', () => {
    const labels = labelsFor(frFR);
    expect(REPORT_TYPE_KEYS.filter((key) => !labels[key])).toEqual([]);
  });

  it('covers every report type in en-US', () => {
    const labels = labelsFor(enUS);
    expect(REPORT_TYPE_KEYS.filter((key) => !labels[key])).toEqual([]);
  });

  it('covers every family in both locales', () => {
    // The sheet's first step renders these, so a missing one shows a raw key.
    for (const [locale, dict] of [
      ['fr-FR', frFR],
      ['en-US', enUS],
    ] as const) {
      const labels = familyLabelsFor(dict);
      expect(
        REPORT_FAMILIES.filter((family) => !labels[family]),
        `missing families in ${locale}`,
      ).toEqual([]);
    }
  });

  it('carries no label for a type that no longer exists', () => {
    const known = new Set<string>(REPORT_TYPE_KEYS);
    for (const [locale, dict] of [
      ['fr-FR', frFR],
      ['en-US', enUS],
    ] as const) {
      const stale = Object.keys(labelsFor(dict)).filter((key) => !known.has(key));
      expect(stale, `stale keys in ${locale}`).toEqual([]);
    }
  });
});
