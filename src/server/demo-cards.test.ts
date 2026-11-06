// The demo page's card buttons on a real migrated database: each card's run leaves the records
// the scenario tests pin (src/server/scenarios/, the same numbers, pinned once here because
// those files export none), lands on the page the judges compare, and a second click is
// refused and linked, picks up a run stopped before signing, or only previews card 8 again
// (D70). Steps are codes with params, never sentences.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { seedPack } from '../../tests/helpers/invoice-fixture';
import { quoteAndApply } from '../../tests/helpers/journey';
import { resetDb } from '../../tests/helpers/reset-db';
import { createTestDb } from '../../tests/helpers/test-db';
import { withProductionHandlers } from '../../tests/helpers/with-handlers';
import { getApplication } from './applications';
import { readPassport } from './asset-events';
import { getAsset } from './assets';
import { verifyAuditChain } from './audit';
import { getContract } from './contracts';
import { DEMO_CARD_IDS, demoCardRunSchema } from './demo-cards-schemas';
import { DEMO_CARDS, runDemoCard, type RunDemoCardResult } from './demo-cards';
import { exitContract } from './exits';
import { listInvoices } from './invoices';
import type { PrismaClient } from './prisma-client';
import { assessAsset, latestAssessment } from './second-life';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetDb(db);
  await seedPack(db);
});
withProductionHandlers();

function ran(result: RunDemoCardResult) {
  if (!result.ok) throw new Error(`${result.reason.code} ${JSON.stringify(result.reason.params)}`);
  expect(demoCardRunSchema.parse(result.run)).toEqual(result.run);
  return result.run;
}

function idOf(landing: string): string {
  return landing.split('/').at(-1) ?? '';
}

function codes(run: { steps: Array<{ code: string }> }): string[] {
  return run.steps.map((s) => s.code);
}

describe('the card table', () => {
  it('has the ten cards of CHALLENGE.md section 4, once each, in order', () => {
    expect(DEMO_CARDS.map((c) => c.id)).toEqual([...DEMO_CARD_IDS]);
  });
});

describe('runDemoCard', () => {
  it('card 1: signed on 2026-11-05 as Aino, lands on the contract: 13 466 then 13 520', async () => {
    const run = ran(await runDemoCard(db, 1));
    expect(run).toMatchObject({ today: '2026-11-05', actor: 'cust-aino' });
    expect(codes(run)).toEqual([
      'quote_created',
      'application_decided',
      'application_reason',
      'contract_signed',
    ]);
    expect(run.landing).toMatch(/^\/contracts\//);
    const contract = await getContract(db, idOf(run.landing));
    expect(contract).toMatchObject({ startDate: '2026-11-05', monthlyNetCents: 10_730 });
    const invoices = await listInvoices(db, idOf(run.landing));
    expect(invoices.slice(0, 3).map((i) => i.grossCents)).toEqual([13_466, 13_466, 13_520]);
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });

  it('card 2: quoted on 5 Nov, signed on 6 Nov: keeps 9 627 and says why', async () => {
    const run = ran(await runDemoCard(db, 2));
    expect(run.today).toBe('2026-11-06');
    expect(run.steps.at(-1)).toEqual({
      code: 'price_locked_from_quote',
      params: {
        quoteDate: '2026-11-05',
        priceListVersion: 1,
        currentPriceListVersion: 2,
        currentMonthlyNetCents: 8_857,
      },
    });
    const contract = await getContract(db, idOf(run.landing));
    expect(contract).toMatchObject({ signedOn: '2026-11-06', monthlyNetCents: 9_627 });
  });

  it('card 3: ebike-001 from 15 Sep 2026, the clock on 1 Jan 2027: December 8 731, January 8 766', async () => {
    const run = ran(await runDemoCard(db, 3));
    expect(run.today).toBe('2027-01-01');
    const invoices = await listInvoices(db, idOf(run.landing));
    expect(invoices.find((i) => i.issueDate === '2026-12-15')?.grossCents).toBe(8_731);
    expect(invoices.find((i) => i.issueDate === '2027-01-15')?.grossCents).toBe(8_766);
  });

  it('card 4: laptop-001 from 31 Jan 2026: due 28 Feb 2026 and 29 Feb 2028, ends 30 Jan 2029', async () => {
    const run = ran(await runDemoCard(db, 4));
    const contract = await getContract(db, idOf(run.landing));
    expect(contract).toMatchObject({ startDate: '2026-01-31', endDate: '2029-01-30' });
    const due = (await listInvoices(db, idOf(run.landing))).map((i) => i.dueDate);
    expect(due).toEqual(expect.arrayContaining(['2026-02-28', '2028-02-29']));
  });

  it('card 5: Mikko is rejected as too young; lands on the application', async () => {
    const run = ran(await runDemoCard(db, 5));
    expect(run).toMatchObject({
      actor: 'cust-mikko',
      landing: expect.stringMatching(/^\/applications\//),
    });
    expect(run.steps.at(-1)).toMatchObject({
      code: 'application_reason',
      params: { reason: 'too_young', birthDate: '2009-03-10', eighteenOn: '2027-03-10' },
    });
    expect((await getApplication(db, idOf(run.landing)))?.decision).toBe('rejected');
  });

  it('card 6: one ebike-004 for Norvi, 15 144 a month, awaiting the signatory', async () => {
    const run = ran(await runDemoCard(db, 6));
    expect(run.steps[0]).toMatchObject({
      params: { assetId: 'ebike-004', monthlyNetCents: 15_144 },
    });
    expect(run.steps[0]!.params).not.toHaveProperty('quantity');
    expect((await getApplication(db, idOf(run.landing)))?.decision).toBe('awaiting_signatory');
  });

  it('card 7: farm-002 for Haapala with 20 000 down, 272 038 a month, in manual review (PEP)', async () => {
    const run = ran(await runDemoCard(db, 7));
    expect(run.steps[0]).toMatchObject({ params: { monthlyNetCents: 272_038 } });
    const application = await getApplication(db, idOf(run.landing));
    expect(application).toMatchObject({ decision: 'manual_review', reasons: [{ code: 'pep' }] });
  });

  it('card 8: card 1 signed, seven rents paid, the preview on 2027-06-05: buy 330 675, return 75 945', async () => {
    const run = ran(await runDemoCard(db, 8));
    expect(run.today).toBe('2027-06-05');
    expect(codes(run)).toEqual([
      'quote_created',
      'application_decided',
      'application_reason',
      'contract_signed',
      'rents_paid',
      'exit_previewed',
    ]);
    expect(run.steps.at(-1)?.params).toMatchObject({
      monthsPaid: 7,
      buyTotalCents: 330_675,
      returnTotalCents: 75_945,
    });
    expect((await getContract(db, idOf(run.landing)))?.status).toBe('active');
  });

  it('card 8 after card 1: reuses its contract and pays the seven rents on it', async () => {
    const first = ran(await runDemoCard(db, 1));
    const run = ran(await runDemoCard(db, 8));
    expect(run.landing).toBe(first.landing);
    expect(codes(run)).toEqual(['contract_reused', 'rents_paid', 'exit_previewed']);
    expect(run.steps[1]?.params).toEqual({ count: 7, grossCents: 2 * 13_466 + 5 * 13_520 });
  });

  it('card 9: assesses ebike-007 as admin, relists it fair for wait-02 at 6 497 a month', async () => {
    const run = ran(await runDemoCard(db, 9));
    expect(run).toMatchObject({
      today: '2026-11-06',
      actor: 'admin',
      landing: '/assets/ebike-007/second-life',
    });
    expect(codes(run)).toEqual(['asset_assessed', 'relisted_for_winner']);
    // The numbers src/domain/scenarios/card-09-second-life.test.ts pins on the pack.
    expect(run.steps[0]?.params).toMatchObject({
      assetId: 'ebike-007',
      condition: 'fair',
      refurbishmentCents: 39_500,
      secondLifeFinancedCents: 115_976,
    });
    expect(run.steps[1]?.params).toEqual({
      demandId: 'wait-02',
      condition: 'fair',
      termMonths: 12,
      monthlyNetCents: 6_497,
    });
    const assessed = await latestAssessment(db, 'ebike-007');
    expect(assessed?.match.ranking.map((r) => r.demandId).slice(0, 2)).toEqual([
      'wait-02',
      'wait-13',
    ]);
    expect((await getAsset(db, 'ebike-007'))?.status).toBe('available');
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });

  it('card 10: assesses ebike-008, leases it 24 months at 1 194, three lives and 58 kg', async () => {
    const run = ran(await runDemoCard(db, 10));
    expect(run).toMatchObject({ today: '2026-11-06', landing: '/assets/ebike-008/passport' });
    expect(codes(run)).toEqual([
      'asset_assessed',
      'relisted_for_winner',
      'leased_from_catalogue',
      'quote_created',
      'application_decided',
      'application_reason',
      'contract_signed',
    ]);
    // The numbers src/server/scenarios/card-10.test.ts pins.
    expect(run.steps[0]?.params).toMatchObject({ secondLifeFinancedCents: 32_601 });
    expect(run.steps[1]?.params).toMatchObject({ demandId: 'wait-05', condition: 'good' });
    // wait-05 is a waiting-list entry with no customer record: Olavi leases it from the catalogue.
    expect(run.steps[2]).toEqual({
      code: 'leased_from_catalogue',
      params: { demandId: 'wait-05', customer: 'cust-olavi' },
    });
    const signed = run.steps.at(-1)!;
    expect(signed.params).toMatchObject({ monthlyNetCents: 1_194 });
    const contract = await getContract(db, idOf(signed.href!));
    expect([contract?.financedCents, contract?.monthlyNetCents]).toEqual([32_601, 1_194]);
    const read = await readPassport(db, 'ebike-008', contract!.endDate);
    expect(read?.passport.lives).toHaveLength(3);
    expect(read?.co2.perLifeKg).toEqual([0, 29, 29]);
    expect(read?.co2.totalKg).toBe(58);
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });
});

describe('a second click (D70)', () => {
  it('is refused with card_already_run, links the earlier records and writes nothing', async () => {
    const first = ran(await runDemoCard(db, 1));
    const before = await db.auditLog.count();
    expect(await runDemoCard(db, 1)).toEqual({
      ok: false,
      reason: { code: 'card_already_run', params: { cardId: 1 } },
      today: '2026-11-05',
      actor: 'cust-aino',
      landing: first.landing,
    });
    expect(await runDemoCard(db, 5)).toMatchObject({ ok: true });
    expect(await runDemoCard(db, 5)).toMatchObject({
      ok: false,
      landing: expect.stringMatching(/^\/applications\//),
    });
    ran(await runDemoCard(db, 8));
    const afterEight = await db.auditLog.count();
    expect(afterEight).toBeGreaterThan(before);
    // Card 8 again only shows the preview again: nothing left to pay, nothing written.
    const again = ran(await runDemoCard(db, 8));
    expect(again.landing).toBe(first.landing);
    expect(codes(again)).toEqual(['contract_reused', 'exit_previewed']);
    expect(await db.auditLog.count()).toBe(afterEight);
  });

  it.each([
    [9, '/assets/ebike-007/second-life'],
    [10, '/assets/ebike-008/passport'],
  ] as const)('card %i again is refused, links %s and writes nothing', async (id, landing) => {
    ran(await runDemoCard(db, id));
    const before = await db.auditLog.count();
    expect(await runDemoCard(db, id)).toEqual({
      ok: false,
      reason: { code: 'card_already_run', params: { cardId: id } },
      today: '2026-11-06',
      actor: 'admin',
      landing,
    });
    expect(await db.auditLog.count()).toBe(before);
  });

  it('card 10 picks up a run stopped after the assessment: no second assessment, it signs', async () => {
    const assessed = await assessAsset(db, {
      assetId: 'ebike-008',
      actor: 'admin',
      today: '2026-11-06',
    });
    expect(assessed.ok).toBe(true);
    const run = ran(await runDemoCard(db, 10));
    expect(codes(run)).not.toContain('asset_assessed');
    expect(codes(run).at(-1)).toBe('contract_signed');
    expect(run.steps.at(-1)?.params).toMatchObject({ monthlyNetCents: 1_194 });
  });

  it('signs an approved application an earlier run left unsigned, instead of refusing', async () => {
    const card = DEMO_CARDS[0]!;
    if (card.run !== 'sign') throw new Error('card 1 signs');
    const { application } = await quoteAndApply(db, card.trip);
    const run = ran(await runDemoCard(db, 1));
    expect(codes(run)).toEqual(['application_reused', 'contract_signed']);
    expect(run.steps[0]?.href).toBe(`/applications/${application.id}`);
    expect((await getContract(db, idOf(run.landing)))?.monthlyNetCents).toBe(10_730);
  });

  it('is not fooled by another deal on the same item and day (a 24-month quote by hand)', async () => {
    await quoteAndApply(db, {
      customerId: 'cust-aino',
      assetId: 'ebike-003',
      termMonths: 24,
      quoteOn: '2026-11-05',
    });
    const run = ran(await runDemoCard(db, 1));
    expect(codes(run)[0]).toBe('quote_created');
    expect((await getContract(db, idOf(run.landing)))?.monthlyNetCents).toBe(10_730);
  });

  it('refuses card 8 once its contract has ended, linking it', async () => {
    const first = ran(await runDemoCard(db, 8));
    const contractId = idOf(first.landing);
    const ended = await exitContract(
      db,
      {
        contractId,
        mode: 'buy',
        reported: { condition: 'good', usage: { unit: 'km', value: 1_800 } },
        actor: 'cust-aino',
      },
      '2027-06-05'
    );
    expect(ended.ok).toBe(true);
    expect(await runDemoCard(db, 8)).toMatchObject({
      ok: false,
      reason: { code: 'card_already_run' },
      landing: first.landing,
    });
  });

  it('runs all ten cards one after another on one database, the chain intact', async () => {
    for (const id of DEMO_CARD_IDS) ran(await runDemoCard(db, id));
    expect(await verifyAuditChain(db)).toMatchObject({ ok: true });
  });

  it('a card whose item is taken is refused at the step with the service reason', async () => {
    // Another visitor leased the item through the app; the test writes it directly.
    await db.asset.update({ where: { id: 'laptop-008' }, data: { status: 'leased' } });
    expect(await runDemoCard(db, 5)).toEqual({
      ok: false,
      reason: {
        code: 'card_step_refused',
        params: { cardId: 5, step: 'quote', reason: 'asset_not_available' },
      },
      today: '2026-11-05',
      actor: 'cust-mikko',
      landing: null,
    });
  });
});
