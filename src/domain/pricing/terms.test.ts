import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadTermLimits } from '@/data/load';
import type { CoefficientTable, TermLimits } from '@/data/schemas';
import { allowedTerms, allowedTermsOf, categoryOf, longestAllowedTerm, termAllowed } from './terms';

// Against the real files, so a changed cap or table fails here first.
let table: CoefficientTable;
let limits: TermLimits;
beforeAll(async () => {
  [table, limits] = await Promise.all([loadCoefficientTable(), loadTermLimits()]);
});

const withCap = (category: keyof TermLimits['max_term_months'], cap: number): TermLimits => ({
  note: 'test',
  max_term_months: { e_bike: 48, laptop: 36, farm_machine: 48, [category]: cap },
});

describe("allowedTerms (D43: the table's terms up to the category's cap)", () => {
  it('offers an e-bike every term of the table, 12 to 48', () => {
    expect(allowedTerms('e_bike', table, limits)).toEqual([12, 24, 36, 48]);
  });

  it('caps a laptop at 36 months', () => {
    expect(allowedTerms('laptop', table, limits)).toEqual([12, 24, 36]);
  });

  it('offers a farm machine every term of the table, 12 to 48', () => {
    expect(allowedTerms('farm_machine', table, limits)).toEqual([12, 24, 36, 48]);
  });

  it("gives an empty list when the cap is below the table's shortest term", () => {
    expect(allowedTerms('laptop', table, withCap('laptop', 6))).toEqual([]);
  });

  it('rounds a cap between two terms down to the terms the table has', () => {
    expect(allowedTerms('laptop', table, withCap('laptop', 30))).toEqual([12, 24]);
    expect(allowedTerms('laptop', table, withCap('laptop', 47))).toEqual([12, 24, 36]);
  });

  it('never offers more than the table, however high the cap', () => {
    expect(allowedTerms('e_bike', table, withCap('e_bike', 120))).toEqual([12, 24, 36, 48]);
  });

  it('throws on a category that is not in the data (D23: parsed with assetCategorySchema)', () => {
    expect(() => allowedTerms('boat' as never, table, limits)).toThrow(/Invalid option/);
  });
});

describe('longestAllowedTerm (what the refusal names)', () => {
  it('is the last term of the table under the cap: 36 for a laptop, and still 36 for a cap of 40', () => {
    expect(longestAllowedTerm('laptop', table, limits)).toBe(36);
    expect(longestAllowedTerm('laptop', table, withCap('laptop', 40))).toBe(36);
    expect(longestAllowedTerm('e_bike', table, limits)).toBe(48);
  });

  it('is the cap itself when no term of the table fits under it', () => {
    expect(longestAllowedTerm('laptop', table, withCap('laptop', 6))).toBe(6);
  });
});

describe('termAllowed', () => {
  it('allows 36 and refuses 48 for a laptop, allows 48 for an e-bike', () => {
    expect(termAllowed('laptop', 36, table, limits)).toBe(true);
    expect(termAllowed('laptop', 48, table, limits)).toBe(false);
    expect(termAllowed('e_bike', 48, table, limits)).toBe(true);
  });

  it('refuses a term the table does not have, even under the cap', () => {
    expect(termAllowed('e_bike', 30, table, limits)).toBe(false);
  });
});

describe('categoryOf and allowedTermsOf (the cap by asset id, when the data carries it)', () => {
  const assets = [
    { id: 'a', category: 'laptop' as const },
    { id: 'b', category: 'e_bike' as const },
  ];

  it('finds the category of a listed asset and null for one that is not listed', () => {
    expect(categoryOf(assets, 'a')).toBe('laptop');
    expect(categoryOf(assets, 'zzz')).toBeNull();
  });

  it("caps by the asset's category", () => {
    const data = { table, termLimits: limits, assets };
    expect(allowedTermsOf(data, 'a')).toEqual([12, 24, 36]);
    expect(allowedTermsOf(data, 'b')).toEqual([12, 24, 36, 48]);
  });

  it('offers no term for an asset whose category the data does not know', () => {
    expect(allowedTermsOf({ table, termLimits: limits, assets }, 'zzz')).toEqual([]);
  });
});
