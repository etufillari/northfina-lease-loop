// Card 7, big ticket: Haapalan Tila leases `farm-002` for 48 months with 20 000 € down. The
// rent is exactly half a cent, so the rounding rule shows; the amount brings the company,
// farm, revenue, owner and PEP questions; a PEP owner ends in manual review.
import { describe, expect, it } from 'vitest';
import { applyFor, customerById, quoteFor } from './fixtures';

const deal = {
  assetId: 'farm-002',
  termMonths: 48,
  downPaymentCents: 2_000_000,
  isoDate: '2026-11-05',
};

describe('card 7: big ticket (Haapala, farm-002, 48 months, 2 000 000 down)', () => {
  it('finances 12 500 000 in band D at 21 763 millionths: 272 037.5 rounds half up to 272 038', () => {
    const q = quoteFor(deal);
    expect(q.ok && q.quote).toMatchObject({
      listPriceCents: 14_500_000,
      financedCents: 12_500_000,
      band: 'D',
      factorMillionths: 21_763,
      monthlyNetCents: 272_038,
    });
    expect(12_500_000 * 21_763).toBe(272_037_500_000); // exactly half a cent over 272 037
  });

  it('the buyout is 8 % of the financed amount: 1 000 000', () => {
    const q = quoteFor(deal);
    expect(q.ok && q.quote.buyoutCents).toBe(1_000_000);
  });

  it('asks the company, farm registry, revenue, owners, PEP and PEP-details questions', () => {
    const app = applyFor(customerById('cust-haapala'), deal);
    if (!app.ok) throw new Error('the flow did not complete');
    expect(app.askedIds).toEqual(
      expect.arrayContaining([
        'q_company_name',
        'q_business_id',
        'q_farm_registry',
        'q_annual_revenue',
        'q_beneficial_owners',
        'q_pep',
        'q_pep_details',
      ])
    );
    expect(app.askedIds).not.toContain('q_usage_purpose');
    expect(app.askedIds).not.toContain('q_birth_date');
  });

  it('a PEP is never auto-approved: manual_review with the pep code', () => {
    const app = applyFor(customerById('cust-haapala'), deal);
    expect(app.ok && app.result).toEqual({
      decision: 'manual_review',
      reasons: [{ code: 'pep', params: {} }],
    });
  });
});
