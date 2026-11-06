// planExit: the status, the event, the invoice and the cancelled rents of an exit, pure.
// Card 8 (card 1 left in month 7) and the end-of-term exits cards 9 and 10 start from.
import { describe, expect, it } from 'vitest';
import refurbishmentJson from '../../../data/refurbishment-costs.json';
import residualCurvesJson from '../../../data/residual-curves.json';
import vatRatesJson from '../../../data/vat-rates.json';
import { refurbishmentCostsSchema, residualCurvesSchema, vatRatesSchema } from '@/data/schemas';
import { exitBilling, planExit, type PlanExitInput } from './exit-plan';

const curves = residualCurvesSchema.parse(residualCurvesJson);
const costs = refurbishmentCostsSchema.parse(refurbishmentJson);
const vatRates = vatRatesSchema.parse(vatRatesJson);

/** 36 rents `inv-1` … `inv-36`, the first `paid` of them paid. */
function rents(paid: number) {
  return Array.from({ length: 36 }, (_, i) => ({
    id: `inv-${i + 1}`,
    kind: 'rent',
    status: i < paid ? 'paid' : 'issued',
  }));
}

function input(overrides: Partial<PlanExitInput> = {}): PlanExitInput {
  return {
    contract: {
      id: 'c-1',
      customerId: 'cust-aino',
      assetId: 'ebike-003',
      status: 'active',
      financedCents: 389_000,
      monthlyNetCents: 10_730,
      termMonths: 36,
      buyoutCents: 58_350,
      endDate: '2029-11-04',
      startDate: '2026-11-05',
      unitListPriceCents: 389_000,
      quantity: 1,
    },
    mode: 'buy',
    today: '2027-06-05',
    reported: { condition: 'good', usage: { unit: 'km', value: 1_800 } },
    invoices: rents(7),
    asset: { category: 'e_bike' },
    atSigning: { condition: 'new', usage: { unit: 'km', value: 0 } },
    curve: {
      listPriceCents: 389_000,
      age: { modelYear: 2026, previousLives: 0, leaseStart: '2026-11-05' },
    },
    annualInterestPercent: 7.9,
    curves,
    costs,
    vatRates,
    ...overrides,
  };
}

function plan(overrides: Partial<PlanExitInput> = {}) {
  const result = planExit(input(overrides));
  if (!result.ok) throw new Error(result.reason.code);
  return result.plan;
}

describe('planExit, card 8: Aino leaves in month 7', () => {
  it('a buy before the end is still a buy: ended_early, CONTRACT_BOUGHT_OUT 330 675 net', () => {
    const p = plan();
    expect(p.status).toBe('ended_early');
    expect(p.endedOn).toBe('2027-06-05');
    expect(p.reason).toBe('early_exit');
    expect(p.event).toEqual({
      type: 'CONTRACT_BOUGHT_OUT',
      contractId: 'c-1',
      assetId: 'ebike-003',
      date: '2027-06-05',
      amountCents: 330_675,
    });
  });

  it('bills an early_exit invoice at the 26 % of its own day: 330 675 + 85 976 = 416 651', () => {
    expect(plan().invoice).toEqual({
      kind: 'early_exit',
      issueDate: '2027-06-05',
      dueDate: '2027-06-05',
      netCents: 330_675,
      vatRateBasisPoints: 2600,
      vatCents: 85_976,
      grossCents: 416_651,
    });
  });

  it('cancels the 29 unpaid rents and keeps the 7 paid ones', () => {
    const p = plan();
    expect(p.cancelInvoiceIds).toHaveLength(29);
    expect(p.cancelInvoiceIds[0]).toBe('inv-8');
    expect(p.cancelInvoiceIds).not.toContain('inv-7');
  });

  it('a return emits UNIT_RETURNED with the reported condition and bills 75 945 net', () => {
    const p = plan({ mode: 'return' });
    expect(p.status).toBe('ended_early');
    expect(p.event).toEqual({
      type: 'UNIT_RETURNED',
      contractId: 'c-1',
      assetId: 'ebike-003',
      date: '2027-06-05',
      reason: 'early_exit',
      condition: 'good',
      usage: { unit: 'km', value: 1_800 },
    });
    expect(p.invoice).toMatchObject({ kind: 'early_exit', netCents: 75_945, vatCents: 19_746 });
  });

  it('D90: an early pass-on names the next customer, cancels the unpaid rents and bills 71 445 net, no refurbishment', () => {
    const p = plan({ mode: 'pass_on', nextCustomerId: 'cust-matti' });
    expect(p.event).toMatchObject({ type: 'UNIT_PASSED_ON', nextCustomerId: 'cust-matti' });
    expect(p.invoice?.netCents).toBe(71_445);
    expect(p.status).toBe('ended_early');
  });

  it('an overdue unpaid rent is cancelled too: the balance already contains it', () => {
    const invoices = rents(7).map((i) => (i.id === 'inv-5' ? { ...i, status: 'issued' } : i));
    const p = plan({ invoices });
    expect(p.cancelInvoiceIds).toContain('inv-5');
    expect(p.cost.monthsPaid).toBe(6);
  });
});

describe('planExit at the end of the term', () => {
  const end = { today: '2029-11-04', invoices: rents(36) };

  it('buy on the last day: bought, kind buyout, the frozen 58 350, nothing cancelled', () => {
    const p = plan(end);
    expect(p.status).toBe('bought');
    expect(p.reason).toBe('end_of_term');
    expect(p.invoice).toMatchObject({ kind: 'buyout', netCents: 58_350, vatCents: 15_171 });
    expect(p.cancelInvoiceIds).toEqual([]);
  });

  it('return after the end: returned, no invoice (the refurbishment is shown, not billed)', () => {
    const p = plan({ ...end, today: '2029-11-20', mode: 'return' });
    expect(p.status).toBe('returned');
    expect(p.cost.return.totalCents).toBe(4_500);
    expect(p.invoice).toBeNull();
    expect(p.event).toMatchObject({ type: 'UNIT_RETURNED', reason: 'end_of_term' });
  });

  it('pass-on at the end: passed_on', () => {
    expect(plan({ ...end, mode: 'pass_on', nextCustomerId: 'cust-matti' }).status).toBe(
      'passed_on'
    );
  });
});

describe('planExit refusals and guards', () => {
  it('refuses a contract that is not active', () => {
    expect(planExit(input({ contract: { ...input().contract, status: 'bought' } }))).toEqual({
      ok: false,
      reason: { code: 'contract_not_active', params: { status: 'bought' } },
    });
  });

  it('refuses an exit before the lease starts, so ended_on is never before start_date', () => {
    expect(planExit(input({ today: '2026-11-04' }))).toEqual({
      ok: false,
      reason: { code: 'not_started', params: { startDate: '2026-11-05' } },
    });
  });

  it('a pass-on needs a next customer, and not the leaving one', () => {
    expect(planExit(input({ mode: 'pass_on' }))).toMatchObject({
      ok: false,
      reason: { code: 'pass_on_needs_next_customer' },
    });
    expect(planExit(input({ mode: 'pass_on', nextCustomerId: 'cust-aino' }))).toMatchObject({
      ok: false,
      reason: { code: 'next_customer_is_self' },
    });
  });

  it('refuses a pass-on below good: it would relist without refurbishment (D90, review 2)', () => {
    for (const condition of ['fair', 'poor'] as const) {
      expect(
        planExit(
          input({
            mode: 'pass_on',
            nextCustomerId: 'cust-lena',
            reported: { condition, usage: { unit: 'km', value: 1_800 } },
          })
        )
      ).toEqual({
        ok: false,
        reason: { code: 'pass_on_below_leasable', params: { condition, needed: 'good' } },
      });
    }
    expect(
      planExit(input({ mode: 'pass_on', nextCustomerId: 'cust-lena' })) // reported good
    ).toMatchObject({ ok: true });
  });

  it('refuses a reason that contradicts the day, and a usage in the wrong unit', () => {
    expect(planExit(input({ reason: 'end_of_term' }))).toMatchObject({
      ok: false,
      reason: { code: 'reason_mismatch', params: { reason: 'early_exit' } },
    });
    expect(
      planExit(
        input({ reported: { condition: 'good', usage: { unit: 'engine_hours', value: 1 } } })
      )
    ).toMatchObject({
      ok: false,
      reason: { code: 'usage_unit_mismatch', params: { expected: 'km' } },
    });
  });

  it('nothing to pay is not a refusal: a zero early exit issues no invoice', () => {
    const zero = plan({
      mode: 'return',
      today: '2029-10-10',
      invoices: rents(35),
      reported: { condition: 'new', usage: { unit: 'km', value: 0 } },
      costs: { ...costs, e_bike: { ...costs.e_bike, fixed: [] } },
    });
    expect(zero.cost.return.totalCents).toBe(0);
    expect(zero.invoice).toBeNull();
    expect(zero.status).toBe('ended_early');
  });

  it('a day with no VAT rate is a refusal', () => {
    expect(planExit(input({ vatRates: { ...vatRates, rates: [] } }))).toMatchObject({
      ok: false,
      reason: { code: 'no_vat_rate_on_date', params: { isoDate: '2027-06-05' } },
    });
  });

  it('D23: a bad mode, condition, status, reason or invoice kind throws', () => {
    expect(() => planExit(input({ mode: 'sell' }))).toThrow();
    expect(() =>
      planExit(input({ reported: { condition: 'shiny', usage: { unit: 'km', value: 0 } } }))
    ).toThrow();
    expect(() =>
      planExit(input({ contract: { ...input().contract, status: 'paused' } }))
    ).toThrow();
    expect(() => planExit(input({ reason: 'bored' }))).toThrow();
    expect(() =>
      planExit(input({ invoices: [{ id: 'x', kind: 'tip', status: 'paid' }] }))
    ).toThrow();
  });
});

describe('planExit checks the report against the asset at signing (D77, review finding 2)', () => {
  it('refuses a usage below the one at signing: 18 000 km at signing, 0 reported', () => {
    const result = planExit(
      input({
        mode: 'return',
        atSigning: { condition: 'fair', usage: { unit: 'km', value: 18_000 } },
        reported: { condition: 'new', usage: { unit: 'km', value: 0 } },
      })
    );
    expect(result).toEqual({
      ok: false,
      reason: { code: 'usage_below_signing', params: { value: 0, atSigning: 18_000, unit: 'km' } },
    });
  });

  it('prices and records a fair bike reported new as fair: the worse of the two', () => {
    const fair = { condition: 'fair' as const, usage: { unit: 'km' as const, value: 18_000 } };
    const claimed = plan({
      mode: 'return',
      atSigning: fair,
      reported: { ...fair, condition: 'new' },
    });
    const honest = plan({ mode: 'return', atSigning: fair, reported: fair });
    expect(claimed.cost.return).toEqual(honest.cost.return);
    expect(claimed.event).toMatchObject({ type: 'UNIT_RETURNED', condition: 'fair' });
  });

  it('a condition worse than at signing is taken as reported', () => {
    const p = plan({
      mode: 'return',
      reported: { condition: 'poor', usage: { unit: 'km', value: 1_800 } },
    });
    expect(p.event).toMatchObject({ condition: 'poor' });
  });
});

describe('exitBilling', () => {
  it('is what planExit bills, so a handler can recompute it from the event', () => {
    const p = plan({ mode: 'return' });
    const billing = exitBilling({
      mode: 'return',
      cost: p.cost,
      today: '2027-06-05',
      invoices: rents(7),
      vatRates,
    });
    expect(billing).toEqual({ ok: true, invoice: p.invoice, cancelInvoiceIds: p.cancelInvoiceIds });
  });
});
