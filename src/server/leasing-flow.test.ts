// The whole server-side Spine against a real (test) database, as one story:
// quote → application → answers → decision → signature → invoices → early exit /
// end of term. Scenario card numbers appear as named steps.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import {
  answerQuestion,
  getApplicationState,
  startApplication,
  submitApplication,
} from './applications';
import { getContract, listCustomerContracts, signApplication } from './contracts';
import { createCustomer, saveDefaults, seedCustomers } from './customers';
import {
  earlyExitPreview,
  endOfTerm,
  executeEarlyExit,
  setBuyoutOption,
  termEndsOn,
} from './lifecycle';
import { buildLiveQuote } from './quotes';
import { seedAssets } from './assets';
import { seedWaitlist, listWaitlist } from './waitlist';

let db: Awaited<ReturnType<typeof createTestDb>>['db'];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, await loadCustomers());
  await seedWaitlist(db, await loadSecondLifeDemand());
});
afterAll(async () => {
  await cleanup();
});

const AINO = 'cust-aino';
const AS_OF = '2026-11-05';

async function answer(applicationId: string, questionId: string, value: unknown) {
  const result = await answerQuestion(db, {
    applicationId,
    questionId,
    answer: value as never,
    actor: AINO,
    asOf: AS_OF,
  });
  if (!result.ok) throw new Error(`answer ${questionId}: ${result.reason}`);
  return result.state;
}

describe('the spine, server-side (scenario card 1 + card 8)', () => {
  let applicationId = '';
  let contractId = '';

  it('prices a live quote with the card-1 numbers', async () => {
    const live = await buildLiveQuote({
      assetIds: ['ebike-003'],
      downPaymentCents: 0,
      termMonths: 36,
      asOf: AS_OF,
    });
    expect(live).toMatchObject({
      ok: true,
      live: {
        priceListVersion: 1,
        quote: { monthlyNetRentCents: 10_730, buyoutNetCents: 58_350 },
        monthlyRentWithVatCents: 13_466,
      },
    });
  });

  it('starts an application and walks the question flow', async () => {
    const started = await startApplication(db, {
      assetIds: ['ebike-003'],
      downPaymentCents: 0,
      termMonths: 36,
      customerId: AINO,
      actor: AINO,
      asOf: AS_OF,
    });
    if (!started.ok) throw new Error(started.reason);
    applicationId = started.state.application.id;
    expect(started.state.nextQuestionId).toBe('q_customer_type');

    const first = await answer(applicationId, 'q_customer_type', 'consumer');
    expect(first.nextQuestionId).toBe('q_full_name');
    await answer(applicationId, 'q_full_name', 'Aino Virtanen');
    await answer(applicationId, 'q_birth_date', '1997-04-12');
    await answer(applicationId, 'q_email', 'aino.virtanen@example.com');
    await answer(applicationId, 'q_country', 'FI');
    const afterEmployment = await answer(applicationId, 'q_employment', 'employed');
    // Income is asked: the deal is over €2,000 financed.
    expect(afterEmployment.nextQuestionId).toBe('q_monthly_income');
    await answer(applicationId, 'q_monthly_income', 320_000);
    const complete = await answer(applicationId, 'q_usage_purpose', 'commuting');
    expect(complete.nextQuestionId).toBeNull();
    expect(complete.blocked).toBeNull();
  });

  it('changing the customer type would drop the whole consumer branch', async () => {
    const before = await getApplicationState(db, applicationId, AS_OF);
    expect(Object.keys(before!.application.answers)).toContain('q_employment');
    const flipped = await answer(applicationId, 'q_customer_type', 'company');
    // The usage question survives: it depends on the category, not on who is leasing.
    expect(Object.keys(flipped.application.answers).sort()).toEqual([
      'q_customer_type',
      'q_email',
      'q_usage_purpose',
    ]);
    // Flip back and re-answer for the rest of the story.
    await answer(applicationId, 'q_customer_type', 'consumer');
    await answer(applicationId, 'q_full_name', 'Aino Virtanen');
    await answer(applicationId, 'q_birth_date', '1997-04-12');
    await answer(applicationId, 'q_country', 'FI');
    await answer(applicationId, 'q_employment', 'employed');
    await answer(applicationId, 'q_monthly_income', 320_000);
    const state = await answer(applicationId, 'q_usage_purpose', 'commuting');
    expect(state.nextQuestionId).toBeNull();
  });

  it('approves on submit, with reasons, a 7-day hold and the asset reserved', async () => {
    const result = await submitApplication(db, {
      applicationId,
      startDate: AS_OF,
      actor: AINO,
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(result.state.application.status).toBe('approved');
    expect(result.state.application.holdUntil).toBe('2026-11-12');
    const reasons = result.state.application.decisionReasons as Array<{ outcome: string }>;
    expect(reasons.some((r) => r.outcome === 'failed')).toBe(false);
    const asset = await db.asset.findUnique({ where: { id: 'ebike-003' } });
    expect(asset?.status).toBe('reserved');
  });

  it('rejects a second submission and signing with a bad start date', async () => {
    const again = await submitApplication(db, {
      applicationId,
      startDate: AS_OF,
      actor: AINO,
      asOf: AS_OF,
    });
    expect(again).toEqual({ ok: false, reason: 'not_a_draft' });
    const tooFar = await signApplication(db, {
      applicationId,
      startDate: '2027-02-06',
      actor: AINO,
      asOf: AS_OF,
    });
    expect(tooFar).toEqual({ ok: false, reason: 'start_too_far_ahead' });
  });

  it('signs: locked contract, 36 invoices that add up, asset leased, passport stamped', async () => {
    const signed = await signApplication(db, {
      applicationId,
      startDate: AS_OF,
      actor: AINO,
      asOf: AS_OF,
    });
    if (!signed.ok) throw new Error(signed.reason);
    contractId = signed.contractId;

    const contract = await getContract(db, contractId);
    expect(contract).toMatchObject({
      price_list_version: 1,
      monthly_net_rent_cents: 10_730,
      net_total_cents: 386_286,
    });
    expect(contract!.invoices).toHaveLength(36);
    const netSum = contract!.invoices.reduce((sum, i) => sum + i.net_cents, 0);
    expect(netSum).toBe(386_286);
    // Card 3's logic on this contract: January 2027 is at 26 %.
    const january = contract!.invoices.find((i) => i.due_date === '2027-01-05');
    expect(january).toMatchObject({ vat_rate_bp: 2600, total_cents: 13_520 });

    expect((await db.asset.findUnique({ where: { id: 'ebike-003' } }))?.status).toBe('leased');
    expect(await db.assetEvent.count({ where: { asset_id: 'ebike-003', type: 'leased' } })).toBe(1);
    expect(termEndsOn(contract!)).toBe('2029-11-04');

    const mine = await listCustomerContracts(db, AINO);
    expect(mine.map((c) => c.id)).toContain(contractId);
  });

  it('scenario card 8: the early-exit preview in month 7, then the exit itself', async () => {
    const preview = await earlyExitPreview(db, contractId, '2027-05-06');
    expect(preview).toMatchObject({
      ok: true,
      preview: {
        breakdown: {
          usedMonths: 7,
          chargedMonths: 7,
          coveringTermMonths: 12,
          exitNetCents: 116_743,
          exitTotalCents: 147_096,
        },
      },
    });

    const optIn = await setBuyoutOption(db, { contractId, optIn: true, actor: AINO });
    expect(optIn.ok).toBe(true);

    const tooEarly = await endOfTerm(db, {
      contractId,
      action: 'return',
      actor: AINO,
      asOf: '2027-05-06',
    });
    expect(tooEarly).toEqual({ ok: false, reason: 'term_not_ended' });

    const exit = await executeEarlyExit(db, { contractId, actor: AINO, asOf: '2027-05-06' });
    expect(exit.ok).toBe(true);
    const contract = await getContract(db, contractId);
    expect(contract?.status).toBe('ended_early_exit');
    // The exit invoice was issued with 30 days to pay.
    const exitInvoice = contract!.invoices.find((i) => i.type === 'early_exit');
    expect(exitInvoice).toMatchObject({ total_cents: 147_096, due_date: '2027-06-05' });
    expect((await db.asset.findUnique({ where: { id: 'ebike-003' } }))?.status).toBe('returned');

    // A second exit is refused: the contract is no longer active.
    const again = await earlyExitPreview(db, contractId, '2027-05-07');
    expect(again).toEqual({ ok: false, reason: 'not_active' });
  });
});

describe('end of term: buying the item takes it out of the loop', () => {
  it('runs a 12-month lease to its end and buys the item', async () => {
    const started = await startApplication(db, {
      assetIds: ['laptop-003'],
      downPaymentCents: 0,
      termMonths: 12,
      customerId: AINO,
      actor: AINO,
      asOf: AS_OF,
    });
    if (!started.ok) throw new Error(started.reason);
    const id = started.state.application.id;
    await answer(id, 'q_customer_type', 'consumer');
    await answer(id, 'q_full_name', 'Aino Virtanen');
    await answer(id, 'q_birth_date', '1997-04-12');
    await answer(id, 'q_email', 'aino.virtanen@example.com');
    await answer(id, 'q_country', 'FI');
    await answer(id, 'q_employment', 'employed');
    await answer(id, 'q_monthly_income', 320_000);
    const submitted = await submitApplication(db, {
      applicationId: id,
      startDate: AS_OF,
      actor: AINO,
      asOf: AS_OF,
    });
    if (!submitted.ok) throw new Error(submitted.reason);
    const signed = await signApplication(db, {
      applicationId: id,
      startDate: AS_OF,
      actor: AINO,
      asOf: AS_OF,
    });
    if (!signed.ok) throw new Error(signed.reason);

    const bought = await endOfTerm(db, {
      contractId: signed.contractId,
      action: 'buy',
      actor: AINO,
      asOf: '2027-11-04',
    });
    expect(bought).toEqual({ ok: true });
    const contract = await getContract(db, signed.contractId);
    expect(contract?.status).toBe('ended_bought');
    const buyout = contract!.invoices.find((i) => i.type === 'buyout');
    expect(buyout?.net_cents).toBe(contract!.buyout_net_cents);
    expect((await db.asset.findUnique({ where: { id: 'laptop-003' } }))?.status).toBe('sold');
  });
});

describe('fleets are groups of distinct assets', () => {
  it('two laptops become one contract banded on the total, each asset leased', async () => {
    const started = await startApplication(db, {
      assetIds: ['laptop-004', 'laptop-005'],
      downPaymentCents: 0,
      termMonths: 24,
      customerId: 'cust-aino',
      actor: 'cust-aino',
      asOf: AS_OF,
    });
    if (!started.ok) throw new Error(started.reason);
    expect(started.state.quote.assetIds).toEqual(['laptop-004', 'laptop-005']);
    await answer(started.state.application.id, 'q_customer_type', 'consumer');
    await answer(started.state.application.id, 'q_full_name', 'Aino Virtanen');
    await answer(started.state.application.id, 'q_birth_date', '1997-04-12');
    await answer(started.state.application.id, 'q_email', 'aino.virtanen@example.com');
    await answer(started.state.application.id, 'q_country', 'FI');
    await answer(started.state.application.id, 'q_employment', 'employed');
    await answer(started.state.application.id, 'q_monthly_income', 320_000);
    const submitted = await submitApplication(db, {
      applicationId: started.state.application.id,
      startDate: AS_OF,
      actor: 'cust-aino',
      asOf: AS_OF,
    });
    if (!submitted.ok) throw new Error(submitted.reason);
    const signed = await signApplication(db, {
      applicationId: started.state.application.id,
      startDate: AS_OF,
      actor: 'cust-aino',
      asOf: AS_OF,
    });
    if (!signed.ok) throw new Error(signed.reason);
    const contract = await getContract(db, signed.contractId);
    expect(contract!.assets.map((a) => a.asset_id).sort()).toEqual(['laptop-004', 'laptop-005']);
    for (const id of ['laptop-004', 'laptop-005']) {
      expect((await db.asset.findUnique({ where: { id } }))?.status).toBe('leased');
    }
  });

  it('refuses duplicates and mixed categories', async () => {
    const base = {
      downPaymentCents: 0,
      termMonths: 24,
      customerId: 'cust-aino',
      actor: 'cust-aino',
      asOf: AS_OF,
    };
    expect(await startApplication(db, { ...base, assetIds: ['ebike-001', 'ebike-001'] })).toEqual({
      ok: false,
      reason: 'duplicate_assets',
    });
    expect(await startApplication(db, { ...base, assetIds: ['ebike-001', 'laptop-008'] })).toEqual({
      ok: false,
      reason: 'mixed_categories',
    });
  });
});

describe('customers and the waiting list', () => {
  it('creates an empty user and saves prefill defaults on opt-in', async () => {
    const created = await createCustomer(db, {
      name: 'Testi Henkilö',
      email: 'testi@example.com',
      type: 'consumer',
      actor: 'Testi Henkilö',
    });
    expect(created.id).toBeTruthy();
    await saveDefaults(db, {
      customerId: created.id,
      defaults: { q_full_name: 'Testi Henkilö', q_country: 'FI' },
      actor: created.id,
    });
    const row = await db.customer.findUnique({ where: { id: created.id } });
    expect(JSON.parse(row!.saved_defaults_json!)).toMatchObject({ q_country: 'FI' });
  });

  it('prefills a new application from the customer profile', async () => {
    const customers = await loadCustomers();
    expect(customers.length).toBeGreaterThan(0); // the data pack is seeded
    const started = await startApplication(db, {
      assetIds: ['ebike-001'],
      downPaymentCents: 0,
      termMonths: 24,
      customerId: AINO,
      actor: AINO,
      asOf: AS_OF,
    });
    if (!started.ok) throw new Error(started.reason);
    // A returning customer's profile prefills the visible questions right away.
    expect(started.state.prefill).toMatchObject({
      q_customer_type: 'consumer',
      q_email: 'aino.virtanen@example.com',
    });
  });

  it('seeded the waiting list in first-come order', async () => {
    const waitlist = await listWaitlist(db);
    expect(waitlist).toHaveLength(14);
    expect(waitlist[0]!.id).toBe('wait-10'); // joined 2026-09-15
    // wait-08 wants three office laptops; everyone else wants one.
    expect(waitlist.find((w) => w.id === 'wait-08')?.quantity).toBe(3);
    expect(waitlist.find((w) => w.id === 'wait-06')?.quantity).toBe(1);
  });
});
