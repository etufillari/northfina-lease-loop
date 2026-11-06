import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { applyPaymentFor, paymentStateFor, type RecordedPayment } from './payments';

const base = {
  totalCents: 10_000,
  dueOn: '2026-01-17',
  asOf: '2026-01-17',
};

describe('paymentStateFor', () => {
  it('reports an unpaid invoice with its full balance remaining', () => {
    expect(paymentStateFor({ ...base, payments: [] })).toEqual({
      totalPaidCents: 0,
      remainingCents: 10_000,
      status: 'unpaid',
      isOverdue: false,
    });
  });

  it('reports partial and exact payments', () => {
    const partial = paymentStateFor({
      ...base,
      payments: [{ amountCents: 4_000, paidOn: '2026-01-17' }],
    });
    expect(partial).toMatchObject({
      totalPaidCents: 4_000,
      remainingCents: 6_000,
      status: 'partially_paid',
    });

    expect(
      paymentStateFor({
        ...base,
        payments: [
          { amountCents: 4_000, paidOn: '2026-01-17' },
          { amountCents: 6_000, paidOn: '2026-01-18' },
        ],
      })
    ).toMatchObject({ totalPaidCents: 10_000, remainingCents: 0, status: 'paid' });
  });

  it('becomes overdue after the due date while money remains', () => {
    expect(paymentStateFor({ ...base, asOf: '2026-01-18', payments: [] }).isOverdue).toBe(true);
    expect(
      paymentStateFor({
        ...base,
        asOf: '2026-01-18',
        payments: [{ amountCents: 10_000, paidOn: '2026-01-17' }],
      }).isOverdue
    ).toBe(false);
  });

  it('reconciles arbitrary valid payment splits exactly', () => {
    const positiveCents = fc.integer({ min: 1, max: 2_000_000 });
    fc.assert(
      fc.property(fc.array(positiveCents, { minLength: 1, maxLength: 12 }), (parts) => {
        const totalCents = parts.reduce((sum, amount) => sum + amount, 0);
        const payments: RecordedPayment[] = parts.map((amount) => ({
          amountCents: amount,
          paidOn: '2026-01-17',
        }));
        const state = paymentStateFor({ ...base, totalCents, payments });
        expect(state).toEqual({
          totalPaidCents: totalCents,
          remainingCents: 0,
          status: 'paid',
          isOverdue: false,
        });
      }),
      { numRuns: 2_000 }
    );
  });
});

describe('applyPaymentFor', () => {
  it('rejects invalid, future-dated, and excessive payments', () => {
    expect(
      applyPaymentFor({ ...base, payments: [], payment: { amountCents: 0, paidOn: base.asOf } })
    ).toEqual({ ok: false, reason: 'invalid_payment_amount' });
    expect(
      applyPaymentFor({
        ...base,
        payments: [],
        payment: { amountCents: 1_000, paidOn: '2026-01-18' },
      })
    ).toEqual({ ok: false, reason: 'payment_date_in_future' });
    expect(
      applyPaymentFor({
        ...base,
        payments: [],
        payment: { amountCents: 10_001, paidOn: base.asOf },
      })
    ).toEqual({ ok: false, reason: 'payment_exceeds_balance', remainingCents: 10_000 });
  });

  it('returns the exact state after a valid payment', () => {
    expect(
      applyPaymentFor({
        ...base,
        payments: [{ amountCents: 2_000, paidOn: base.asOf }],
        payment: { amountCents: 8_000, paidOn: base.asOf },
      })
    ).toEqual({
      ok: true,
      state: { totalPaidCents: 10_000, remainingCents: 0, status: 'paid', isOverdue: false },
    });
  });
});
