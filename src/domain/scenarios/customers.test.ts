// Every customer of the data pack applies for one asset of each category through the real
// question flow and eligibility rules: each result is a known decision with known reason
// codes and params, and nothing throws.
import { describe, expect, it } from 'vitest';
import { applicationDecisions } from '../statuses';
import { applyFor, pack } from './fixtures';

const DAY = '2026-11-05';
const ONE_PER_CATEGORY = [
  { assetId: 'ebike-003', termMonths: 36, isoDate: DAY },
  { assetId: 'laptop-004', termMonths: 36, isoDate: DAY },
  { assetId: 'farm-002', termMonths: 48, downPaymentCents: 2_000_000, isoDate: DAY },
];
const REASON_CODES = [
  'too_young',
  'residency_not_allowed',
  'unaffordable',
  'invalid_business_id',
  'financed_out_of_range',
  'missing_answer',
  'pep',
  'signatory_needed',
  'all_checks_passed',
];

const cases = pack.customers.flatMap((customer) =>
  ONE_PER_CATEGORY.map((deal) => ({ customer, deal }))
);

describe('every customer applies for every category', () => {
  it('covers 10 customers × 3 categories', () => {
    expect(cases).toHaveLength(30);
    expect(new Set(ONE_PER_CATEGORY.map((d) => d.assetId.split('-')[0]))).toEqual(
      new Set(['ebike', 'laptop', 'farm'])
    );
  });

  it.each(cases.map((c) => [c.customer.id, c.deal.assetId, c]))(
    '%s for %s: a known decision with coded reasons',
    (_customer, _asset, { customer, deal }) => {
      const app = applyFor(customer, deal);
      if (!app.ok) throw new Error(`the flow stopped at ${app.step}`);
      expect(applicationDecisions).toContain(app.result.decision);
      expect(app.result.reasons.length).toBeGreaterThan(0);
      for (const reason of app.result.reasons) {
        expect(REASON_CODES).toContain(reason.code);
        for (const value of Object.values(reason.params)) {
          expect(['string', 'number']).toContain(typeof value);
        }
      }
    }
  );

  // decision:reason codes for ebike-003, laptop-004 and farm-002; a bare decision has the one
  // reason the decision implies (all_checks_passed, signatory_needed).
  it.each([
    ['cust-aino', 'approved', 'approved', 'rejected:unaffordable'],
    [
      'cust-mikko',
      'rejected:too_young+unaffordable',
      'rejected:too_young+unaffordable',
      'rejected:too_young+unaffordable',
    ],
    ['cust-lena', 'approved', 'approved', 'rejected:unaffordable'],
    ['cust-pekka', 'approved', 'approved', 'approved'],
    ['cust-kettukoodi', 'approved', 'approved', 'approved'],
    // D82: below 10 000 € financed the PEP question is hidden, so no PEP check runs.
    ['cust-haapala', 'approved', 'approved', 'manual_review:pep'],
    ['cust-norvi', 'awaiting_signatory', 'awaiting_signatory', 'awaiting_signatory'],
    [
      'cust-broken-id',
      'rejected:invalid_business_id',
      'rejected:invalid_business_id',
      'rejected:invalid_business_id',
    ],
    ['cust-sanna', 'approved', 'approved', 'rejected:unaffordable'],
    ['cust-olavi', 'approved', 'approved', 'rejected:unaffordable'],
  ])('%s: e-bike %s, laptop %s, farm machine %s', (customerId, ...expected) => {
    const customer = pack.customers.find((c) => c.id === customerId)!;
    const got = ONE_PER_CATEGORY.map((deal) => {
      const app = applyFor(customer, deal);
      if (!app.ok) return app.step;
      const codes = app.result.reasons.map((r) => r.code);
      const implied =
        codes.length === 1 && ['all_checks_passed', 'signatory_needed'].includes(codes[0]!);
      return implied ? app.result.decision : `${app.result.decision}:${codes.join('+')}`;
    });
    expect(got).toEqual(expected);
  });
});
