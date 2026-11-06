import { expect, it } from 'vitest';
import { requireStorableInvoice } from './spine-invoice-limits';

it('accepts the last Prisma Int cent and rejects a gross total one cent beyond it', () => {
  const maximum = {
    netCents: 2_147_483_647,
    vatBasisPoints: 0,
    vatCents: 0,
    grossCents: 2_147_483_647,
  };
  expect(() => requireStorableInvoice(maximum)).not.toThrow();
  expect(() =>
    requireStorableInvoice({ ...maximum, vatCents: 1, grossCents: 2_147_483_648 })
  ).toThrow(expect.objectContaining({ status: 422, code: 'AMOUNT_TOO_LARGE' }));
});

const normal = { netCents: 10730, vatBasisPoints: 2550, vatCents: 2736, grossCents: 13466 };

it.each(['netCents', 'vatBasisPoints', 'vatCents', 'grossCents'] as const)(
  'validates the entire storage range of %s',
  (field) => {
    for (const value of [0, 2_147_483_647]) {
      expect(() => requireStorableInvoice({ ...normal, [field]: value })).not.toThrow();
    }
    for (const value of [-1, 0.5, NaN, Infinity, 2_147_483_648, undefined]) {
      expect(() => requireStorableInvoice({ ...normal, [field]: value })).toThrow(
        expect.objectContaining({ status: 422, code: 'AMOUNT_TOO_LARGE' })
      );
    }
  }
);

it('checks the four stored amounts when the calculated invoice includes metadata', () => {
  const draft = { ...normal, period: 1, invoiceDate: '2026-11-05', dueDate: '2026-11-05' };
  expect(() => requireStorableInvoice(draft)).not.toThrow();
});
