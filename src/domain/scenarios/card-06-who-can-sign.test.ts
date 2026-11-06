// Card 6, who can sign: Norvi Logistics applies for one `ebike-004` (every item is unique, D8,
// as the organisers answered on 6 Nov). The coordinator who applies may not sign for the
// company, so the application waits for the named signatory instead of being approved.
import { describe, expect, it } from 'vitest';
import { applyFor, customerById, quoteFor } from './fixtures';

const deal = { assetId: 'ebike-004', termMonths: 36, isoDate: '2026-11-05' };

describe('card 6: who can sign (Norvi, 1 × ebike-004, 36 months)', () => {
  it('one bike: 549 000 financed, band B at 27 584 millionths, rent 15 144 net a month', () => {
    const q = quoteFor(deal);
    expect(q.ok && q.quote).toMatchObject({
      quantity: 1,
      unitListPriceCents: 549_000,
      financedCents: 549_000,
      band: 'B',
      factorMillionths: 27_584,
      monthlyNetCents: 15_144,
    });
  });

  it('asks who can sign and for the signatory, then decides awaiting_signatory', () => {
    const app = applyFor(customerById('cust-norvi'), deal);
    if (!app.ok) throw new Error('the flow did not complete');
    expect(app.askedIds).toEqual(expect.arrayContaining(['q_can_sign', 'q_signatory_email']));
    expect(app.result).toEqual({
      decision: 'awaiting_signatory',
      reasons: [
        { code: 'signatory_needed', params: { signatoryEmail: app.answers.q_signatory_email } },
      ],
    });
  });

  it('asks no PEP questions: one bike is under the 10 000 € anti-money-laundering threshold', () => {
    const app = applyFor(customerById('cust-norvi'), deal);
    if (!app.ok) throw new Error('the flow did not complete');
    expect(app.context.financedCents).toBeLessThan(1_000_000);
    expect(app.askedIds).not.toContain('q_pep');
    expect(app.askedIds).not.toContain('q_pep_details');
  });
});
