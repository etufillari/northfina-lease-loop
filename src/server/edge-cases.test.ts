// The data pack's traps and the edges around the scenario cards, run through the real flow
// (quote → application → decision → signature) rather than one domain function at a time.
// CHALLENGE.md: "band boundaries, minimum and maximum amounts, a broken business ID,
// reserved items" — plus the ones we found ourselves.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { answerQuestion, startApplication } from './applications';
import { seedAssets } from './assets';
import { signApplication } from './contracts';
import { seedCustomers } from './customers';
import { buildLiveQuote } from './quotes';
import { seedWaitlist } from './waitlist';

type Db = Awaited<ReturnType<typeof createTestDb>>['db'];
let db: Db;
let cleanup: () => Promise<void>;
beforeEach(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, await loadCustomers());
  await seedWaitlist(db, await loadSecondLifeDemand());
});
afterEach(async () => {
  await cleanup();
});

const ON = '2026-11-05';
const quote = (assetIds: string[], downPaymentCents = 0, termMonths = 36, asOf = ON) =>
  buildLiveQuote({ assetIds, downPaymentCents, termMonths, asOf });
const start = (customerId: string, assetIds: string[], downPaymentCents = 0) =>
  startApplication(db, {
    assetIds,
    downPaymentCents,
    termMonths: 36,
    customerId,
    actor: customerId,
    asOf: ON,
  });

describe('band boundaries: two laptops at €1,999.99 and €2,000.00', () => {
  it('€1,999.99 is band A (9.9 %), €2,000.00 is band B (7.9 %)', async () => {
    const a = await quote(['laptop-002']);
    const b = await quote(['laptop-003']);
    if (!a.ok || !b.ok) throw new Error('not priceable');
    expect(a.live.quote).toMatchObject({ financedCents: 199_999, band: 'A' });
    expect(b.live.quote).toMatchObject({ financedCents: 200_000, band: 'B' });
    // The cheaper laptop costs more per month: band A's factor is higher.
    expect(a.live.quote.monthlyNetRentCents).toBeGreaterThan(b.live.quote.monthlyNetRentCents);
  });

  it('a 1-cent down payment moves €2,000.00 back into band A', async () => {
    const b = await quote(['laptop-003'], 1);
    if (!b.ok) throw new Error('not priceable');
    expect(b.live.quote).toMatchObject({ financedCents: 199_999, band: 'A' });
  });
});

describe('minimum and maximum amounts', () => {
  it('ebike-010 (€289) is under the €300 minimum: no quote, no application', async () => {
    expect(await quote(['ebike-010'])).toEqual({ ok: false, reason: 'below_minimum' });
    expect((await start('cust-aino', ['ebike-010'])).ok).toBe(false);
  });

  it('… but as part of a fleet it counts toward a total that can be financed', async () => {
    const fleet = await quote(['ebike-010', 'ebike-006']);
    expect(fleet.ok).toBe(true);
  });

  it('farm-006 (€260,000) is over the €250,000 maximum with no down payment', async () => {
    expect(await quote(['farm-006'])).toEqual({ ok: false, reason: 'above_maximum' });
  });

  it('a €10,000 down payment brings it to exactly €250,000, which is allowed', async () => {
    const exactly = await quote(['farm-006'], 1_000_000, 48);
    if (!exactly.ok) throw new Error(exactly.reason);
    expect(exactly.live.quote).toMatchObject({ financedCents: 25_000_000, band: 'D' });
    expect(await quote(['farm-006'], 999_999, 48)).toEqual({ ok: false, reason: 'above_maximum' });
  });

  it('a down payment over 30 % of the price is refused', async () => {
    // 30 % of farm-002's €145,000 is €43,500.
    expect((await quote(['farm-002'], 4_350_000, 48)).ok).toBe(true);
    expect(await quote(['farm-002'], 4_350_001, 48)).toEqual({
      ok: false,
      reason: 'down_payment_over_max',
    });
  });
});

describe('items that cannot be leased right now', () => {
  it('a reserved item (ebike-009) is refused', async () => {
    expect(await start('cust-aino', ['ebike-009'])).toEqual({
      ok: false,
      reason: 'asset_unavailable',
    });
  });

  it('a returned item (ebike-007) is refused until the second-life desk clears it', async () => {
    expect(await start('cust-aino', ['ebike-007'])).toEqual({
      ok: false,
      reason: 'asset_unavailable',
    });
  });

  it('a fleet cannot list the same item twice, or mix categories', async () => {
    expect(await start('cust-norvi', ['ebike-004', 'ebike-004'])).toEqual({
      ok: false,
      reason: 'duplicate_assets',
    });
    expect(await start('cust-norvi', ['ebike-004', 'laptop-001'])).toEqual({
      ok: false,
      reason: 'mixed_categories',
    });
  });

  it('once signed, nobody else can start an application for it', async () => {
    const state = await applyAndSubmit(db, {
      customerId: 'cust-aino',
      assetIds: ['ebike-003'],
      downPaymentCents: 0,
      termMonths: 36,
      script: ainoScript,
      asOf: ON,
    });
    await signApplication(db, {
      applicationId: state.application.id,
      startDate: ON,
      actor: 'cust-aino',
      asOf: ON,
    });
    expect(await start('cust-lena', ['ebike-003'])).toEqual({
      ok: false,
      reason: 'asset_unavailable',
    });
  });
});

describe('the broken business ID: Typo Trading Oy, 1234567-8', () => {
  it('is declined with the business-ID reason, not approved', async () => {
    const state = await applyAndSubmit(db, {
      customerId: 'cust-broken-id',
      assetIds: ['laptop-001'],
      downPaymentCents: 0,
      termMonths: 36,
      script: {
        q_customer_type: 'company',
        q_email: 'hello@typo.example.com',
        q_vat_registered: 'no',
        q_business_id: '1234567-8',
        q_company_name: 'Typo Trading Oy',
        q_can_sign: 'yes',
        q_annual_revenue: 12_000_000,
        q_beneficial_owners: ['Tiina Typo (100 %)'],
        q_pep: 'no',
        q_usage_purpose: 'delivery',
      },
      asOf: ON,
    }).catch((error: Error) => error);
    if (state instanceof Error) {
      // Refused already when the ID is typed in: equally fine, as long as it is refused.
      expect(state.message).toMatch(/q_business_id/);
      return;
    }
    expect(state.application.status).toBe('declined');
    const reasons = state.application.decisionReasons as Array<{ rule: string; outcome: string }>;
    expect(reasons.find((r) => r.rule === 'business_id')?.outcome).toBe('failed');
  });
});

describe('who may answer and who may sign', () => {
  it('only the applicant signs their own approved lease', async () => {
    const state = await applyAndSubmit(db, {
      customerId: 'cust-aino',
      assetIds: ['ebike-003'],
      downPaymentCents: 0,
      termMonths: 36,
      script: ainoScript,
      asOf: ON,
    });
    expect(
      await signApplication(db, {
        applicationId: state.application.id,
        startDate: ON,
        actor: 'cust-lena',
        asOf: ON,
      })
    ).toEqual({ ok: false, reason: 'not_applicant' });
  });
});

describe('age and residency stop the form kindly', () => {
  async function answer(customerId: string, assetId: string, asOf: string, answers: object) {
    const started = await startApplication(db, {
      assetIds: [assetId],
      downPaymentCents: 0,
      termMonths: 24,
      customerId,
      actor: customerId,
      asOf,
    });
    if (!started.ok) throw new Error(started.reason);
    let state = started.state;
    for (const [questionId, value] of Object.entries(answers)) {
      const result = await answerQuestion(db, {
        applicationId: started.state.application.id,
        questionId,
        answer: value as never,
        actor: customerId,
        asOf,
      });
      if (!result.ok) throw new Error(`${questionId}: ${result.reason}`);
      state = result.state;
    }
    return state;
  }

  it('someone born on 29 February is told 1 March in a year without one', async () => {
    const state = await answer('cust-aino', 'laptop-001', '2026-01-15', {
      q_customer_type: 'consumer',
      q_full_name: 'Leap Day',
      q_birth_date: '2008-02-29',
    });
    expect(state.blocked).toEqual({
      questionId: 'q_birth_date',
      rule: 'age_under',
      eligibleFrom: '2026-03-01',
    });
  });

  it('a resident outside Finland, Sweden and Estonia is stopped at the country', async () => {
    const state = await answer('cust-aino', 'laptop-001', ON, {
      q_customer_type: 'consumer',
      q_full_name: 'Aino Virtanen',
      q_birth_date: '1997-04-12',
      q_email: 'aino.virtanen@example.com',
      q_country: 'other',
    });
    expect(state.blocked).toMatchObject({ questionId: 'q_country', rule: 'answer_in' });
  });

  it('answers the form never offers are refused, not stored', async () => {
    await expect(
      answer('cust-aino', 'laptop-001', ON, { q_customer_type: 'consumer', q_country: 'DE' })
    ).rejects.toThrow();
    const bad = (questionId: string, value: unknown) =>
      answer('cust-aino', 'ebike-003', ON, {
        q_customer_type: 'consumer',
        q_full_name: 'Aino Virtanen',
        q_birth_date: '1997-04-12',
        q_email: 'aino.virtanen@example.com',
        q_country: 'FI',
        q_employment: 'employed',
        [questionId]: value,
      });
    await expect(bad('q_monthly_income', '3200 €')).rejects.toThrow(/invalid_answer/);
    await expect(bad('q_monthly_income', 320_000.5)).rejects.toThrow(/invalid_answer/);
  });

  it('a birth date that does not exist is refused', async () => {
    await expect(
      answer('cust-aino', 'laptop-001', ON, {
        q_customer_type: 'consumer',
        q_full_name: 'Aino Virtanen',
        q_birth_date: '2009-02-29',
      })
    ).rejects.toThrow(/invalid_answer/);
  });
});
