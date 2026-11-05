import { beforeAll, describe, expect, it } from 'vitest';
import { loadCoefficientTable } from '@/data/load';
import type { CoefficientTable } from '@/data/schemas';
import { lockContract } from './contract';
import type { Quote } from './pricing';
import { quoteFor } from './pricing';

let table: CoefficientTable;
let quote: Quote;
beforeAll(async () => {
  table = await loadCoefficientTable();
  const result = quoteFor({
    listPriceCents: 389_000,
    downPaymentCents: 0,
    termMonths: 36,
    table,
  });
  if (!result.ok) throw new Error('expected a quote');
  quote = result.quote;
});

describe('lockContract', () => {
  it('scenario card 2: quoted Thursday on price list v1, signed Friday — v1 stays locked', () => {
    const result = lockContract({
      quote,
      quoteDate: '2026-11-05',
      priceListVersion: 1,
      signedDate: '2026-11-06', // price list v2 is live, laptops 8 % cheaper — irrelevant
      startDate: '2026-11-06',
    });
    expect(result).toMatchObject({
      ok: true,
      contract: { priceListVersion: 1, quoteDate: '2026-11-05', signedDate: '2026-11-06' },
    });
  });

  it('expires a quote after the end of the next calendar day', () => {
    expect(
      lockContract({
        quote,
        quoteDate: '2026-11-05',
        priceListVersion: 1,
        signedDate: '2026-11-07',
        startDate: '2026-11-07',
      })
    ).toEqual({ ok: false, reason: 'quote_expired' });
  });

  it('lets the customer start up to 3 months after signing, but not further', () => {
    const base = {
      quote,
      quoteDate: '2026-11-05',
      priceListVersion: 1,
      signedDate: '2026-11-05',
    };
    expect(lockContract({ ...base, startDate: '2027-02-05' })).toMatchObject({ ok: true });
    expect(lockContract({ ...base, startDate: '2027-02-06' })).toEqual({
      ok: false,
      reason: 'start_too_far_ahead',
    });
  });

  it('never starts before signing', () => {
    expect(
      lockContract({
        quote,
        quoteDate: '2026-11-05',
        priceListVersion: 1,
        signedDate: '2026-11-05',
        startDate: '2026-11-04',
      })
    ).toEqual({ ok: false, reason: 'start_before_signing' });
  });

  it('records the usage purpose for the end-of-term check', () => {
    const result = lockContract({
      quote,
      quoteDate: '2026-11-05',
      priceListVersion: 1,
      signedDate: '2026-11-05',
      startDate: '2026-11-05',
      usagePurpose: 'delivery',
    });
    expect(result).toMatchObject({ ok: true, contract: { usagePurpose: 'delivery' } });
  });
});
