import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable, loadPriceLists } from '@/data/load';
import type { CoefficientTable, PriceList } from '@/data/schemas';
import { addDays } from './calendar';
import { priceCheckAtSigning, signContract } from './contract';
import { DOWN_PAYMENT_STEP_CENTS, QUOTE_VALID_DAYS } from './pricing-rules';
import { makeQuote, type Quote } from './quote';

let table: CoefficientTable;
let priceLists: PriceList[];
beforeAll(async () => {
  [table, priceLists] = await Promise.all([loadCoefficientTable(), loadPriceLists()]);
});

function quoteFor(assetId: string, quoteDate: string, termMonths = 36): Quote {
  const result = makeQuote(priceLists, table, {
    assetId,
    quoteDate,
    termMonths,
    downPaymentCents: 0,
  });
  if (!result.ok) throw new Error(`test setup: ${result.reason}`);
  return result.quote;
}

describe('signContract', () => {
  it('locks every number from the quote, whatever the price list says on signing day', () => {
    const quote = quoteFor('laptop-004', '2026-11-05');
    const result = signContract(quote, {
      customerId: 'cust-aino',
      signDate: '2026-11-06',
      startDate: '2026-11-06',
    });
    expect(result).toMatchObject({
      ok: true,
      contract: {
        assetId: 'laptop-004',
        customerId: 'cust-aino',
        signDate: '2026-11-06',
        startDate: '2026-11-06',
        quoteDate: '2026-11-05',
        priceListVersion: 1,
        listPriceCents: 349_000,
        monthlyNetRentCents: 9_627,
        buyoutCents: 52_350, // 15 % of 349 000
        billing: 'start_day_full_months',
      },
    });
  });

  it('is frozen: a locked contract cannot be edited afterwards', () => {
    const result = signContract(quoteFor('laptop-004', '2026-11-05'), {
      customerId: 'cust-aino',
      signDate: '2026-11-05',
      startDate: '2026-11-05',
    });
    if (!result.ok) throw new Error('expected a contract');
    expect(Object.isFrozen(result.contract)).toBe(true);
    expect(() => {
      (result.contract as { monthlyNetRentCents: number }).monthlyNetRentCents = 1;
    }).toThrow(TypeError);
  });

  it('accepts a quote through its last valid day and refuses it the day after', () => {
    const quote = quoteFor('laptop-004', '2026-11-05'); // valid until 2026-11-12
    const sign = (signDate: string) =>
      signContract(quote, { customerId: 'cust-aino', signDate, startDate: signDate });
    expect(sign('2026-11-12').ok).toBe(true);
    expect(sign('2026-11-13')).toEqual({ ok: false, reason: 'quote_expired' });
  });

  it('refuses a signature dated before the quote, or a lease starting before it is signed', () => {
    const quote = quoteFor('laptop-004', '2026-11-05');
    expect(
      signContract(quote, { customerId: 'c', signDate: '2026-11-04', startDate: '2026-11-05' })
    ).toEqual({ ok: false, reason: 'signed_before_quote' });
    expect(
      signContract(quote, { customerId: 'c', signDate: '2026-11-06', startDate: '2026-11-05' })
    ).toEqual({ ok: false, reason: 'starts_before_signing' });
  });
});

describe('priceCheckAtSigning', () => {
  it('offers the cheaper quote when today’s rent would be lower (card 2, laptops −8 %)', () => {
    // Quote Thu: 9 627/month. Re-quote Fri on v2: 8 857/month. Saving 770/month.
    const check = priceCheckAtSigning(
      priceLists,
      table,
      quoteFor('laptop-004', '2026-11-05'),
      '2026-11-06'
    );
    expect(check).toMatchObject({
      kind: 'cheaper_today',
      savingPerMonthCents: 770,
      requote: { quoteDate: '2026-11-06', priceListVersion: 2, monthlyNetRentCents: 8_857 },
    });
  });

  it('keeps the quoted price when today’s list is dearer: the quote protects the customer', () => {
    // ebike-003 Thu v1 389 000 → 10 730/month. Fri v2 408 400 → 11 265/month (408 400 × 0.027584).
    const check = priceCheckAtSigning(
      priceLists,
      table,
      quoteFor('ebike-003', '2026-11-05'),
      '2026-11-06'
    );
    expect(check).toEqual({ kind: 'dearer_today', extraPerMonthCents: 535 });
  });

  it('reports no change when signing on a day with the same price list', () => {
    const check = priceCheckAtSigning(
      priceLists,
      table,
      quoteFor('farm-002', '2026-11-05', 48),
      '2026-11-06'
    );
    expect(check).toEqual({ kind: 'unchanged' });
  });

  it('keeps the quote when the item cannot be re-quoted today', () => {
    // An asset missing from today's price list has nothing to compare against.
    const quote = { ...quoteFor('laptop-004', '2026-11-05'), assetId: 'no-such-asset' };
    expect(priceCheckAtSigning(priceLists, table, quote, '2026-11-06')).toEqual({
      kind: 'unchanged',
    });
  });
});

describe('signContract properties (random quotes, signed any day they are valid)', () => {
  const anyQuote = fc.record({
    assetIndex: fc.nat(),
    // 5 Nov 2026 (v1) to early 2027 (v2): both price lists.
    quoteDate: fc.integer({ min: 0, max: 90 }).map((d) => addDays('2026-11-05', d)),
    termMonths: fc.constantFrom(12, 24, 36, 48),
    downSteps: fc.integer({ min: 0, max: 2_000 }),
    signAfterDays: fc.integer({ min: 0, max: QUOTE_VALID_DAYS }),
    startAfterDays: fc.integer({ min: 0, max: 60 }),
  });

  it('never changes an amount: the contract is the quote, number for number', () => {
    fc.assert(
      fc.property(anyQuote, (q) => {
        const assetIds = Object.keys(priceLists[0]?.prices ?? {});
        const assetId = assetIds[q.assetIndex % assetIds.length] ?? '';
        const made = makeQuote(priceLists, table, {
          assetId,
          quoteDate: q.quoteDate,
          termMonths: q.termMonths,
          downPaymentCents: q.downSteps * DOWN_PAYMENT_STEP_CENTS,
        });
        fc.pre(made.ok);
        if (!made.ok) return;
        const signDate = addDays(q.quoteDate, q.signAfterDays);
        const signed = signContract(made.quote, {
          customerId: 'cust-test',
          signDate,
          startDate: addDays(signDate, q.startAfterDays),
        });
        if (!signed.ok) throw new Error(signed.reason);
        const { validUntil: _validUntil, ...locked } = made.quote;
        expect(signed.contract).toMatchObject(locked);
      })
    );
  });
});
