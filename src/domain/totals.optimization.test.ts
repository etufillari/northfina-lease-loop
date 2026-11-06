import { expect, it } from 'vitest';
import type { VatRates } from '@/data/schemas';
import { leaseTotals } from './totals';

const vatRates: VatRates = {
  country: 'FI',
  note: 'Synthetic tax fixture',
  rates: [
    { rate_percent: 25.5, valid_from: '2024-09-01', valid_to: '2026-12-31' },
    { rate_percent: 26, valid_from: '2027-01-01', valid_to: null, fictional: true },
  ],
};

it('retains first-match and zero-amount semantics when indexing issued rent', () => {
  // The service must enforce uniqueness; this checks first-record compatibility.
  const issued = [
    { kind: 'rent', period: 2, grossCents: 10000 },
    { kind: 'rent', period: 1, grossCents: 0 },
    { kind: 'rent', period: 1, grossCents: 9999 },
    { kind: 'down_payment', period: 0, grossCents: 0 },
    { kind: 'buyout', period: 0, grossCents: 0 },
  ];
  const before = structuredClone(issued);
  const result = leaseTotals({
    terms: {
      listPriceCents: 389000,
      downPaymentCents: 0,
      financedCents: 389000,
      termMonths: 36,
      coefficientTableId: 'ct-2026-1',
      coefficientTableVersion: 1,
      band: 'B',
      factorMillionths: 27584,
      monthlyNetCents: 10730,
      buyoutNetCents: 58350,
      totalRentNetCents: 386280,
    },
    startDate: '2026-11-05',
    upfrontDate: '2026-11-05',
    vatRates,
    issued,
  });
  // 486612 forecast - 13466 first - 13466 second + 0 first + 10000 second.
  expect(result).toEqual({
    ok: true,
    rentGrossCents: 469680,
    useGrossCents: 469680,
    ownGrossCents: 469680,
    issuedGrossCents: 19999,
  });
  expect(issued).toEqual(before);
});
