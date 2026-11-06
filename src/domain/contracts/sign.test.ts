import { describe, expect, it } from 'vitest';
import { contractSignedSchema } from '@/domain/events';
import type { QuoteStatus } from '@/domain/pricing';
import { planContract, START_MONTHS_MAX, type PlanContractInput } from './sign';

/** Card 1: `ebike-003`, 36 months, no down payment, quoted 5 Nov 2026 on list v1. */
const card1Quote: PlanContractInput['quote'] = {
  assetId: 'ebike-003',
  quantity: 1,
  isoDate: '2026-11-05',
  validUntil: '2026-11-19',
  priceListVersion: 1,
  unitListPriceCents: 389_000,
  downPaymentCents: 0,
  financedCents: 389_000,
  band: 'B',
  factorMillionths: 27_584,
  termMonths: 36,
  monthlyNetCents: 10_730,
  buyoutCents: 58_350,
  vatRateBasisPoints: 2550,
};

function statusOn(
  quote: PlanContractInput['quote'],
  today: string,
  todayList: QuoteStatus['todayList']
): QuoteStatus {
  return {
    status: today <= quote.validUntil ? 'valid' : 'expired',
    validUntil: quote.validUntil,
    lockedListVersion: quote.priceListVersion,
    lockedUnitPriceCents: quote.unitListPriceCents,
    todayList,
    cheaperListLive:
      todayList !== null &&
      todayList.version !== quote.priceListVersion &&
      todayList.unitPriceCents < quote.unitListPriceCents,
  };
}

function input(overrides: Partial<PlanContractInput> = {}): PlanContractInput {
  return {
    contractId: 'c-1',
    applicationId: 'app-1',
    customerId: 'cust-aino',
    decision: 'approved',
    assetStatus: 'available',
    quote: card1Quote,
    quoteStatus: statusOn(card1Quote, '2026-11-05', { version: 1, unitPriceCents: 389_000 }),
    currentMonthlyNetCents: 10_730,
    signedOn: '2026-11-05',
    startDate: '2026-11-05',
    ...overrides,
  };
}

function signed(plan: ReturnType<typeof planContract>) {
  if (!plan.ok) throw new Error(`refused: ${plan.reason.code}`);
  return plan;
}

describe('planContract, card 1 (the happy path)', () => {
  it('signs ebike-003 for 36 months from 5 Nov 2026, ending 4 Nov 2029 (start + 36 months − 1 day)', () => {
    const plan = signed(planContract(input()));
    expect(plan.contract).toMatchObject({
      id: 'c-1',
      applicationId: 'app-1',
      customerId: 'cust-aino',
      assetId: 'ebike-003',
      quantity: 1,
      signedOn: '2026-11-05',
      startDate: '2026-11-05',
      endDate: '2029-11-04',
      termMonths: 36,
      status: 'active',
    });
  });

  it('copies every frozen number of the quote, never re-pricing (D7)', () => {
    const plan = signed(planContract(input()));
    expect(plan.contract).toMatchObject({
      unitListPriceCents: 389_000,
      downPaymentCents: 0,
      financedCents: 389_000,
      band: 'B',
      factorMillionths: 27_584,
      monthlyNetCents: 10_730,
      buyoutCents: 58_350,
      priceListVersion: 1,
      vatRateBasisPoints: 2550,
    });
  });

  it('builds a CONTRACT_SIGNED payload that passes the event schema', () => {
    const plan = signed(planContract(input()));
    expect(contractSignedSchema.parse(plan.event)).toEqual({
      type: 'CONTRACT_SIGNED',
      contractId: 'c-1',
      customerId: 'cust-aino',
      assetId: 'ebike-003',
      quantity: 1,
      signedOn: '2026-11-05',
      startDate: '2026-11-05',
      endDate: '2029-11-04',
      termMonths: 36,
      downPaymentCents: 0,
      netRentCents: 10_730,
      buyoutCents: 58_350,
      vatRateBasisPoints: 2550,
    });
  });

  it('has no price lock to explain when the list has not changed', () => {
    expect(signed(planContract(input())).priceLock).toBeNull();
  });

  it('gives the contract a number from the signing day and the application', () => {
    expect(signed(planContract(input({ applicationId: 'cmabc12345xyz' }))).contract.number).toBe(
      'LL-20261105-12345XYZ'
    );
  });
});

describe('planContract, card 2 (the price lock)', () => {
  /** `laptop-004` quoted Thu 5 Nov on v1 at 349 000, rent 9 627. */
  const laptopQuote: PlanContractInput['quote'] = {
    ...card1Quote,
    assetId: 'laptop-004',
    unitListPriceCents: 349_000,
    financedCents: 349_000,
    monthlyNetCents: 9627,
    buyoutCents: 52_350,
  };

  it('signed Fri 6 Nov with v2 8 % cheaper, keeps 9 627 and says why', () => {
    const plan = signed(
      planContract(
        input({
          quote: laptopQuote,
          quoteStatus: statusOn(laptopQuote, '2026-11-06', { version: 2, unitPriceCents: 321_100 }),
          currentMonthlyNetCents: 8857,
          signedOn: '2026-11-06',
          startDate: '2026-11-06',
        })
      )
    );
    expect(plan.contract.monthlyNetCents).toBe(9627);
    expect(plan.contract.unitListPriceCents).toBe(349_000);
    expect(plan.contract.priceListVersion).toBe(1);
    expect(plan.event.netRentCents).toBe(9627);
    expect(plan.priceLock).toEqual({
      code: 'price_locked_from_quote',
      params: {
        quoteDate: '2026-11-05',
        priceListVersion: 1,
        currentPriceListVersion: 2,
        currentMonthlyNetCents: 8857,
      },
    });
  });

  it('has no price lock to explain when no list prices the asset today', () => {
    const plan = signed(
      planContract(
        input({
          quoteStatus: statusOn(card1Quote, '2026-11-06', null),
          currentMonthlyNetCents: null,
          signedOn: '2026-11-06',
          startDate: '2026-11-06',
        })
      )
    );
    expect(plan.priceLock).toBeNull();
  });
});

describe('planContract, card 4 (calendar traps)', () => {
  it('starting 31 Jan 2026 for 36 months ends 30 Jan 2029 (the due dates are invoicing’s)', () => {
    const quote = {
      ...card1Quote,
      assetId: 'laptop-001',
      isoDate: '2026-01-20',
      validUntil: '2026-02-03',
    };
    const plan = signed(
      planContract(
        input({
          quote,
          quoteStatus: statusOn(quote, '2026-01-31', { version: 1, unitPriceCents: 119_900 }),
          signedOn: '2026-01-31',
          startDate: '2026-01-31',
        })
      )
    );
    expect(plan.contract.endDate).toBe('2029-01-30');
    expect(plan.event.endDate).toBe('2029-01-30');
  });

  it('a start on 29 Feb 2028 for 12 months ends 27 Feb 2029 (clamped to the 28th, then − 1)', () => {
    const quote = {
      ...card1Quote,
      isoDate: '2028-02-20',
      validUntil: '2028-03-05',
      termMonths: 12,
    };
    const plan = signed(
      planContract(
        input({
          quote,
          quoteStatus: statusOn(quote, '2028-02-29', { version: 1, unitPriceCents: 389_000 }),
          signedOn: '2028-02-29',
          startDate: '2028-02-29',
        })
      )
    );
    expect(plan.contract.endDate).toBe('2029-02-27');
  });
});

describe('planContract refusals (codes with params)', () => {
  it.each(['rejected', 'manual_review', 'awaiting_signatory'] as const)(
    'application_not_approved when the decision is %s (card 6 awaits the signatory)',
    (decision) => {
      expect(planContract(input({ decision }))).toEqual({
        ok: false,
        reason: { code: 'application_not_approved', params: { decision } },
      });
    }
  );

  it('quote_expired the day after valid_until, with validUntil as param', () => {
    expect(
      planContract(
        input({
          quoteStatus: statusOn(card1Quote, '2026-11-20', { version: 1, unitPriceCents: 389_000 }),
          signedOn: '2026-11-20',
          startDate: '2026-11-20',
        })
      )
    ).toEqual({
      ok: false,
      reason: { code: 'quote_expired', params: { validUntil: '2026-11-19' } },
    });
  });

  it('quote_not_yet_valid before the quote day: the demo clock moved back (review finding 10)', () => {
    expect(
      planContract(
        input({
          quoteStatus: statusOn(card1Quote, '2026-10-01', { version: 1, unitPriceCents: 389_000 }),
          signedOn: '2026-10-01',
          startDate: '2026-10-01',
        })
      )
    ).toEqual({
      ok: false,
      reason: { code: 'quote_not_yet_valid', params: { quoteDate: '2026-11-05' } },
    });
  });

  it('signs on valid_until itself (the last day is inclusive)', () => {
    const plan = planContract(
      input({
        quoteStatus: statusOn(card1Quote, '2026-11-19', { version: 1, unitPriceCents: 389_000 }),
        signedOn: '2026-11-19',
        startDate: '2026-11-19',
      })
    );
    expect(plan.ok).toBe(true);
  });

  it.each(['reserved', 'leased', 'returned', 'sold'] as const)(
    'asset_not_available when the asset is %s (the reserved ebike-009 trap)',
    (status) => {
      expect(planContract(input({ assetStatus: status }))).toEqual({
        ok: false,
        reason: { code: 'asset_not_available', params: { status } },
      });
    }
  );

  it('start_before_signing when the start is the day before the signing day', () => {
    expect(planContract(input({ startDate: '2026-11-04' }))).toEqual({
      ok: false,
      reason: {
        code: 'start_before_signing',
        params: { signedOn: '2026-11-05', startDate: '2026-11-04' },
      },
    });
  });

  it(`accepts a start ${START_MONTHS_MAX} months after signing (D45; D7: signing day before start day)`, () => {
    const plan = signed(planContract(input({ startDate: '2027-11-05' })));
    expect(plan.contract).toMatchObject({ signedOn: '2026-11-05', startDate: '2027-11-05' });
    expect(plan.event.signedOn).toBe('2026-11-05');
  });

  it(`start_too_far one day past ${START_MONTHS_MAX} months after signing`, () => {
    expect(planContract(input({ startDate: '2027-11-06' }))).toEqual({
      ok: false,
      reason: {
        code: 'start_too_far',
        params: { maxStartDate: '2027-11-05', startDate: '2027-11-06', maxMonths: 12 },
      },
    });
  });

  it('caps a 29 February signing at 28 February a year on (the leap-day trap)', () => {
    const leap = { signedOn: '2028-02-29' };
    expect(planContract(input({ ...leap, startDate: '2029-02-28' })).ok).toBe(true);
    expect(planContract(input({ ...leap, startDate: '2029-03-01' }))).toMatchObject({
      ok: false,
      reason: { code: 'start_too_far', params: { maxStartDate: '2029-02-28' } },
    });
  });

  it('checks the decision before the asset, so a rejected application never reads as taken', () => {
    const plan = planContract(input({ decision: 'rejected', assetStatus: 'leased' }));
    expect(plan.ok || plan.reason.code).toBe('application_not_approved');
  });
});

describe('planContract quantity: a guard on stored rows, one unit per contract (D76, D8)', () => {
  it('signs a quantity of 1 and carries it into the contract and the event', () => {
    const plan = signed(planContract(input()));
    expect(plan.contract.quantity).toBe(1);
    expect(plan.event.quantity).toBe(1);
  });

  it('refuses a stored row of 4 × ebike-004 from before D8 was decided: not_enough_units', () => {
    const quote = { ...card1Quote, assetId: 'ebike-004', quantity: 4 };
    expect(planContract(input({ quote }))).toEqual({
      ok: false,
      reason: { code: 'not_enough_units', params: { requested: 4, available: 1 } },
    });
  });

  it('refuses 2 for a single unit, the smallest overselling', () => {
    const plan = planContract(input({ quote: { ...card1Quote, quantity: 2 } }));
    expect(plan.ok || plan.reason).toEqual({
      code: 'not_enough_units',
      params: { requested: 2, available: 1 },
    });
  });

  it('checks the asset first, so a taken item reads as taken, not as short', () => {
    const quote = { ...card1Quote, quantity: 3 };
    const plan = planContract(input({ quote, assetStatus: 'leased' }));
    expect(plan.ok || plan.reason.code).toBe('asset_not_available');
  });
});

describe('planContract parses what it is given (D23)', () => {
  it('throws on a decision that is not one of the four', () => {
    expect(() => planContract(input({ decision: 'approved ' }))).toThrow();
  });

  it('throws on an asset status that is not one of the five', () => {
    expect(() => planContract(input({ assetStatus: 'Available' }))).toThrow();
  });

  it('throws on a day that is not a real ISO day', () => {
    expect(() => planContract(input({ startDate: '2026-02-30' }))).toThrow();
    expect(() => planContract(input({ signedOn: '5.11.2026' }))).toThrow();
  });
});

describe('planContract re-checks the age on the start day (D9 at signing)', () => {
  // born 2008-12-01: 18 on 2026-12-01. The quote is made 2026-11-05, before the birthday.
  const quote = { ...card1Quote, validUntil: '2026-12-31' };
  // The leap-day case signs in January, so its quote is dated that day (finding 10's bound).
  const at = (signedOn: string, startDate: string, birthDate?: string) =>
    planContract(
      input({
        quote: signedOn < quote.isoDate ? { ...quote, isoDate: signedOn } : quote,
        quoteStatus: statusOn(quote, signedOn, { version: 1, unitPriceCents: 389_000 }),
        signedOn,
        startDate,
        birthDate,
      })
    );

  it('too_young_at_start with adultFrom when the start is the day before the 18th birthday', () => {
    const plan = at('2026-11-05', '2026-11-30', '2008-12-01');
    expect(plan.ok ? null : plan.reason).toEqual({
      code: 'too_young_at_start',
      params: { adultFrom: '2026-12-01' },
    });
  });

  it('a quote made before the 18th birthday signs with a start on or after it', () => {
    expect(at('2026-11-05', '2026-12-01', '2008-12-01').ok).toBe(true);
    expect(at('2026-11-20', '2026-12-15', '2008-12-01').ok).toBe(true);
  });

  it('born on 29 February: 18 on 1 March in a year without one', () => {
    const plan = at('2026-01-10', '2026-02-28', '2008-02-29');
    expect(plan.ok ? null : plan.reason).toEqual({
      code: 'too_young_at_start',
      params: { adultFrom: '2026-03-01' },
    });
  });

  it('a company has no birth date: no age check', () => {
    expect(at('2026-11-05', '2026-11-05', undefined).ok).toBe(true);
  });

  it('throws on a birth date that is not a real ISO day (D23)', () => {
    expect(() => at('2026-11-05', '2026-11-05', '2008-02-30')).toThrow();
  });
});
