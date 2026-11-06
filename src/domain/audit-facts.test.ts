import { describe, expect, it } from 'vitest';
import { auditActor, auditFacts } from './audit-facts';

// Expected values are read straight off the payloads below: the function only picks fields,
// it never computes amounts.
describe('auditFacts', () => {
  it('summarises a created quote by rent, term, down payment and validity', () => {
    const details = {
      assetId: 'ebike-005',
      termMonths: 36,
      downPaymentCents: 20000,
      monthlyNetRentCents: 4551,
      priceListVersion: '2026-11',
      validUntil: '2026-12-06',
      asOf: '2026-11-06',
    };
    expect(auditFacts('quote.created', details)).toEqual([
      { key: 'rent', value: { type: 'money', cents: 4551 } },
      { key: 'term', value: { type: 'months', months: 36 } },
      { key: 'downPayment', value: { type: 'money', cents: 20000 } },
      { key: 'validUntil', value: { type: 'date', iso: '2026-12-06' } },
    ]);
  });

  it('leaves out a zero down payment', () => {
    const details = { termMonths: 24, downPaymentCents: 0, monthlyNetRentCents: 5000 };
    expect(auditFacts('quote.created', details).map((fact) => fact.key)).toEqual(['rent', 'term']);
  });

  it('shows the saving when a contract was signed at a cheaper price', () => {
    const details = {
      monthlyNetRentCents: 4400,
      priceCheck: 'cheaper_today',
      priceChoice: 'todays_price',
      savingPerMonthCents: 151,
    };
    expect(auditFacts('contract.signed', details)).toEqual([
      { key: 'rent', value: { type: 'money', cents: 4400 } },
      { key: 'saving', value: { type: 'money', cents: 151 } },
    ]);
  });

  it('shows the extra when the price went up before signing', () => {
    const details = {
      monthlyNetRentCents: 4551,
      priceCheck: 'dearer_today',
      extraPerMonthCents: 99,
    };
    expect(auditFacts('contract.signed', details)).toEqual([
      { key: 'rent', value: { type: 'money', cents: 4551 } },
      { key: 'extra', value: { type: 'money', cents: 99 } },
    ]);
  });

  it('shows the rent of a contract sent to the signatory (D-053)', () => {
    const details = {
      signatoryEmail: 'ceo@norvi.example.com',
      monthlyNetRentCents: 15899,
      priceCheck: 'unchanged',
      asOf: '2026-11-06',
    };
    expect(auditFacts('contract.sent_to_signatory', details)).toEqual([
      { key: 'rent', value: { type: 'money', cents: 15899 } },
    ]);
  });

  it('shows the day the lease took effect when the signatory signed (D-053)', () => {
    const details = { from: 'awaiting_signatory', to: 'active', asOf: '2026-11-20' };
    expect(auditFacts('contract.signed_by_signatory', details)).toEqual([
      { key: 'effective', value: { type: 'date', iso: '2026-11-20' } },
    ]);
  });

  it('shows the effective date and buyout excl. VAT of an end-of-term buy', () => {
    const details = {
      assetId: 'ebike-001',
      kind: 'buy',
      decidedOn: '2026-11-06',
      effectiveDate: '2026-11-30',
      buyoutInvoice: {
        invoiceDate: '2026-11-30',
        vatRatePercent: 25.5,
        netCents: 40000,
        vatCents: 10200,
        grossCents: 50200,
      },
    };
    expect(auditFacts('contract.ended_buy', details)).toEqual([
      { key: 'effective', value: { type: 'date', iso: '2026-11-30' } },
      { key: 'buyout', value: { type: 'money', cents: 40000 } },
    ]);
  });

  it('uses the price excl. VAT of the option taken when leaving early', () => {
    const earlyExit = {
      buy: { netCents: 64800, vatCents: 16524, grossCents: 81324, discountCents: 0 },
      handBack: { netCents: 9840, vatCents: 2509, grossCents: 12349, discountCents: 0 },
    };
    const base = { effectiveDate: '2026-12-01', earlyExit };
    expect(auditFacts('contract.ended_early_buy', { ...base, kind: 'early_buy' })).toContainEqual({
      key: 'exitPrice',
      value: { type: 'money', cents: 64800 },
    });
    expect(
      auditFacts('contract.ended_early_hand_back', { ...base, kind: 'early_hand_back' })
    ).toContainEqual({ key: 'exitPrice', value: { type: 'money', cents: 9840 } });
  });

  it('shows only the date for a plain return', () => {
    const details = { kind: 'return', effectiveDate: '2026-11-30' };
    expect(auditFacts('contract.ended_return', details)).toEqual([
      { key: 'effective', value: { type: 'date', iso: '2026-11-30' } },
    ]);
  });

  it('shows the condition change, list price and refurbishment of a relisting', () => {
    const details = {
      listingId: 2,
      from: { condition: 'fair', usage: 1200 },
      to: { condition: 'good', usage: 1200 },
      refurbishmentCents: 8000,
      listPriceCents: 129900,
    };
    expect(auditFacts('asset.relisted', details)).toEqual([
      { key: 'condition', value: { type: 'condition', from: 'fair', to: 'good' } },
      { key: 'listPrice', value: { type: 'money', cents: 129900 } },
      { key: 'refurbishment', value: { type: 'money', cents: 8000 } },
    ]);
  });

  it('skips a condition that did not change and an unknown condition', () => {
    const same = { from: { condition: 'good' }, to: { condition: 'good' }, listPriceCents: 100 };
    expect(auditFacts('asset.relisted', same).map((fact) => fact.key)).toEqual(['listPrice']);
    const odd = { from: { condition: 'scratched' }, to: { condition: 'good' } };
    expect(auditFacts('asset.relisted', odd)).toEqual([]);
  });

  it('returns nothing for an unknown action, missing details or mistyped fields', () => {
    expect(auditFacts('asset.status_changed', { monthlyNetRentCents: 1 })).toEqual([]);
    expect(auditFacts('quote.created', null)).toEqual([]);
    expect(auditFacts('quote.created', 'oops')).toEqual([]);
    expect(auditFacts('quote.created', { monthlyNetRentCents: 45.5, termMonths: '36' })).toEqual(
      []
    );
  });
});

describe('auditActor', () => {
  const customers = [{ id: 'cust-aino', name: 'Aino Virtanen' }];

  it('names a known customer', () => {
    expect(auditActor('cust-aino', customers)).toEqual({ type: 'customer', name: 'Aino Virtanen' });
  });

  it('recognises the system roles', () => {
    expect(auditActor('customer', customers)).toEqual({ type: 'role', role: 'customer' });
    expect(auditActor('back-office', customers)).toEqual({ type: 'role', role: 'back_office' });
    expect(auditActor('applicant', customers)).toEqual({ type: 'role', role: 'applicant' });
  });

  it('keeps anything else, such as an applicant email, as it is', () => {
    expect(auditActor('someone@example.com', customers)).toEqual({
      type: 'other',
      text: 'someone@example.com',
    });
  });

  it('does not mistake an inherited object key for a role', () => {
    expect(auditActor('constructor', customers)).toEqual({ type: 'other', text: 'constructor' });
  });
});
