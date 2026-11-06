// End-of-term nomination, end to end against a real (test) database: Aino leases ebike-003
// for 12 months and nominates Pekka. His 7 days start when the bike comes back; the desk
// refurbishes and prices it as usual and holds it for him instead of the waiting list; he
// can apply, nobody else can; unused, it goes to the waiting list.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { startApplication } from './applications';
import { seedAssets } from './assets';
import { signApplication } from './contracts';
import { seedCustomers } from './customers';
import { expireLapsedHolds } from './hold-expiry';
import { endOfTerm, nominateSuccessor } from './lifecycle';
import { executeSecondLife, listReturnedDecisions } from './second-life';
import { seedWaitlist } from './waitlist';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
const SIGNED = '2026-11-05';
const TERM_ENDS = '2027-11-04';
const RETURNED = '2027-11-10';

/** Aino's signed 12-month lease of ebike-003; returns the contract id. */
async function ainoLease(db: TestDb['db']): Promise<string> {
  const state = await applyAndSubmit(db, {
    customerId: 'cust-aino',
    assetIds: ['ebike-003'],
    downPaymentCents: 0,
    termMonths: 12,
    script: ainoScript,
    asOf: SIGNED,
  });
  const signed = await signApplication(db, {
    applicationId: state.application.id,
    startDate: SIGNED,
    actor: 'cust-aino',
    asOf: SIGNED,
  });
  if (!signed.ok) throw new Error(signed.reason);
  return signed.contractId;
}

async function freshDb(): Promise<TestDb> {
  const test = await createTestDb();
  await seedAssets(test.db, await loadAssets());
  await seedCustomers(test.db, await loadCustomers());
  await seedWaitlist(test.db, await loadSecondLifeDemand());
  return test;
}

const nomination = (db: TestDb['db']) =>
  db.reservation.findFirstOrThrow({ where: { asset_id: 'ebike-003', kind: 'nomination' } });

describe('nominated during the lease', () => {
  let test: TestDb;
  let contractId = '';
  beforeAll(async () => {
    test = await freshDb();
    contractId = await ainoLease(test.db);
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('holds provisionally to 7 days after the term ends, and nothing lapses meanwhile', async () => {
    const result = await nominateSuccessor(test.db, {
      contractId,
      email: 'pekka@example.com',
      actor: 'cust-aino',
      asOf: '2027-06-01',
    });
    expect(result).toEqual({ ok: true, nomineeCustomerId: 'cust-pekka' });
    expect(await nomination(test.db)).toMatchObject({ until: '2027-11-11', active: true });
    await expireLapsedHolds(test.db, { from: '2027-06-01', to: '2027-06-30' });
    expect((await nomination(test.db)).active).toBe(true);
  });

  it('restarts the 7 days on the day the bike actually comes back', async () => {
    expect(TERM_ENDS < RETURNED).toBe(true);
    const ended = await endOfTerm(test.db, {
      contractId,
      action: 'return',
      actor: 'cust-aino',
      asOf: RETURNED,
    });
    expect(ended).toEqual({ ok: true });
    expect(await nomination(test.db)).toMatchObject({ until: '2027-11-17', active: true });
  });

  it('the desk refurbishes and prices it, then holds it for Pekka instead of the list', async () => {
    const desk = await listReturnedDecisions(test.db, RETURNED);
    const card = desk.find((d) => d.assetId === 'ebike-003')!;
    if (!card.result.ok) throw new Error(card.result.reason);
    expect(card.result.preview.outcome).toEqual({ kind: 'nominee', customerId: 'cust-pekka' });
    expect(card.result.preview.nominee).toMatchObject({ id: 'cust-pekka' });
    expect(card.result.preview.decision.considered).toEqual([]);

    const executed = await executeSecondLife(test.db, {
      assetId: 'ebike-003',
      actor: 'staff',
      asOf: RETURNED,
    });
    if (!executed.ok) throw new Error(executed.reason);
    expect(executed.applied).toBe('nominee');
    const asset = await test.db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    expect(asset.status).toBe('reserved');
    expect(asset.second_life_price_cents).toBe(card.result.preview.decision.financedCents);
    const events = await test.db.assetEvent.findMany({
      where: { asset_id: 'ebike-003', on_date: RETURNED },
      orderBy: { id: 'asc' },
    });
    expect(events.map((e) => e.type)).toEqual(['returned', 'refurbished', 'held_for_nominee']);
  });

  it('only Pekka can apply for it', async () => {
    const deal = { assetIds: ['ebike-003'], downPaymentCents: 0, termMonths: 12, asOf: RETURNED };
    const lena = await startApplication(test.db, {
      ...deal,
      customerId: 'cust-lena',
      actor: 'cust-lena',
    });
    expect(lena).toEqual({ ok: false, reason: 'asset_unavailable' });
    const pekka = await startApplication(test.db, {
      ...deal,
      customerId: 'cust-pekka',
      actor: 'cust-pekka',
    });
    expect(pekka.ok).toBe(true);
  });

  it('unused, it lapses the day after its last day and goes on to the waiting list', async () => {
    await expireLapsedHolds(test.db, { from: RETURNED, to: '2027-11-17' });
    expect((await nomination(test.db)).active).toBe(true);
    const summary = await expireLapsedHolds(test.db, { from: '2027-11-17', to: '2027-11-18' });
    expect(summary.nominations).toEqual([{ day: '2027-11-18', assetId: 'ebike-003' }]);
    expect((await nomination(test.db)).active).toBe(false);
    const asset = await test.db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    const passedOn = await test.db.assetEvent.findFirst({
      where: {
        asset_id: 'ebike-003',
        type: { in: ['offered_to_waiter', 'listed_available'] },
        on_date: '2027-11-18',
      },
    });
    expect(passedOn).not.toBeNull();
    expect(['available', 'reserved']).toContain(asset.status);
  });
});

describe('other nomination timings', () => {
  let test: TestDb;
  let contractId = '';
  beforeAll(async () => {
    test = await freshDb();
    contractId = await ainoLease(test.db);
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('a buyout ends the nomination', async () => {
    await nominateSuccessor(test.db, {
      contractId,
      email: 'pekka@example.com',
      actor: 'cust-aino',
      asOf: '2027-06-01',
    });
    const bought = await endOfTerm(test.db, {
      contractId,
      action: 'buy',
      actor: 'cust-aino',
      asOf: RETURNED,
    });
    expect(bought).toEqual({ ok: true });
    expect((await nomination(test.db)).active).toBe(false);
  });
});

describe('nominated after the return', () => {
  let test: TestDb;
  beforeAll(async () => {
    test = await freshDb();
    const contractId = await ainoLease(test.db);
    await endOfTerm(test.db, { contractId, action: 'return', actor: 'cust-aino', asOf: RETURNED });
    const nominated = await nominateSuccessor(test.db, {
      contractId,
      email: 'pekka@example.com',
      actor: 'cust-aino',
      asOf: '2027-11-12',
    });
    if (!nominated.ok) throw new Error(nominated.reason);
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('runs 7 days from the nomination', async () => {
    expect(await nomination(test.db)).toMatchObject({ until: '2027-11-19', active: true });
  });
});
