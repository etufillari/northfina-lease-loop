// Successor nominations, end to end against a real (test) database: Aino leases ebike-003
// for 12 months and invites Pekka to take it over. Nothing is held until he accepts; once
// accepted the bike waits for him through the return and the desk, and his 3 days start
// when it is ready. Only he can apply; unused, it goes to the waiting list.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers, loadSecondLifeDemand } from '@/data/load';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { startApplication } from './applications';
import { seedAssets } from './assets';
import { signApplication } from './contracts';
import { seedCustomers } from './customers';
import { expireLapsedHolds } from './hold-expiry';
import { endOfTerm, executeEarlyExit, nominateSuccessor, setBuyoutOption } from './lifecycle';
import { answerNomination } from './nominations';
import { executeSecondLife, listReturnedDecisions } from './second-life';
import { seedWaitlist } from './waitlist';

type TestDb = Awaited<ReturnType<typeof createTestDb>>;
const SIGNED = '2026-11-05';
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

/** The latest invitation or nomination on the bike. */
const nomination = (db: TestDb['db']) =>
  db.reservation.findFirstOrThrow({
    where: { asset_id: 'ebike-003', kind: { in: ['nomination', 'nomination_invite'] } },
    orderBy: { id: 'desc' },
  });
const accept = (db: TestDb['db'], asOf: string, accept = true) =>
  answerNomination(db, { assetId: 'ebike-003', customerId: 'cust-pekka', accept, asOf });
const invitePekka = (db: TestDb['db'], contractId: string, asOf: string) =>
  nominateSuccessor(db, { contractId, email: 'pekka@example.com', actor: 'cust-aino', asOf });

describe('invited during the lease, accepted, then returned', () => {
  let test: TestDb;
  let contractId = '';
  beforeAll(async () => {
    test = await freshDb();
    contractId = await ainoLease(test.db);
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('nominating sends an invitation that reserves nothing', async () => {
    expect(await invitePekka(test.db, contractId, '2027-06-01')).toEqual({
      ok: true,
      nomineeCustomerId: 'cust-pekka',
    });
    expect(await nomination(test.db)).toMatchObject({
      kind: 'nomination_invite',
      until: '9999-12-31',
      active: true,
    });
    // Only Aino herself can nominate for her lease.
    expect(
      await nominateSuccessor(test.db, {
        contractId,
        email: 'lena.tamm@example.com',
        actor: 'cust-lena',
        asOf: '2027-06-01',
      })
    ).toEqual({ ok: false, reason: 'not_yours' });
  });

  it('Pekka accepts: the bike waits for him through the lease, with no deadline yet', async () => {
    expect(await accept(test.db, '2027-06-02')).toEqual({ ok: true, heldNow: false });
    expect(await nomination(test.db)).toMatchObject({
      kind: 'nomination',
      until: '9999-12-31',
      active: true,
    });
    // Aino can no longer choose to buy it: it is promised to Pekka.
    expect(await setBuyoutOption(test.db, { contractId, optIn: true, actor: 'cust-aino' })).toEqual(
      { ok: false, reason: 'nominated' }
    );
    // Nothing lapses while the bike is still out, or at the desk.
    const ended = await endOfTerm(test.db, {
      contractId,
      action: 'return',
      actor: 'cust-aino',
      asOf: RETURNED,
      usageReadings: { 'ebike-003': 4800 },
    });
    expect(ended).toEqual({ ok: true });
    await expireLapsedHolds(test.db, { from: '2027-06-02', to: '2027-12-31' });
    expect(await nomination(test.db)).toMatchObject({ kind: 'nomination', active: true });
  });

  it('the desk refurbishes and prices it, holds it for Pekka, and his 3 days start', async () => {
    const desk = await listReturnedDecisions(test.db, RETURNED);
    const card = desk.find((d) => d.assetId === 'ebike-003')!;
    if (!card.result.ok) throw new Error(card.result.reason);
    expect(card.result.preview.outcome).toEqual({ kind: 'nominee', customerId: 'cust-pekka' });
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
    expect(await nomination(test.db)).toMatchObject({ until: '2027-11-13', active: true });
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

  it('unused, it lapses the day after its 3rd day and goes on to the waiting list', async () => {
    await expireLapsedHolds(test.db, { from: RETURNED, to: '2027-11-13' });
    expect((await nomination(test.db)).active).toBe(true);
    const summary = await expireLapsedHolds(test.db, { from: '2027-11-13', to: '2027-11-14' });
    expect(summary.nominations).toEqual([{ day: '2027-11-14', assetId: 'ebike-003' }]);
    expect((await nomination(test.db)).active).toBe(false);
    const passedOn = await test.db.assetEvent.findFirst({
      where: {
        asset_id: 'ebike-003',
        type: { in: ['offered_to_waiter', 'listed_available'] },
        on_date: '2027-11-14',
      },
    });
    expect(passedOn).not.toBeNull();
  });
});

describe('an invitation nobody accepts', () => {
  let test: TestDb;
  let contractId = '';
  beforeAll(async () => {
    test = await freshDb();
    contractId = await ainoLease(test.db);
    await invitePekka(test.db, contractId, '2027-06-01');
    await endOfTerm(test.db, {
      contractId,
      action: 'return',
      actor: 'cust-aino',
      asOf: RETURNED,
      usageReadings: { 'ebike-003': 4800 },
    });
  });
  afterAll(async () => {
    await test.cleanup();
  });

  it('gives no priority: the desk matches the waiting list as usual and ends it', async () => {
    const desk = await listReturnedDecisions(test.db, RETURNED);
    const card = desk.find((d) => d.assetId === 'ebike-003')!;
    if (!card.result.ok) throw new Error(card.result.reason);
    expect(card.result.preview.outcome.kind).not.toBe('nominee');

    await executeSecondLife(test.db, { assetId: 'ebike-003', actor: 'staff', asOf: RETURNED });
    expect((await nomination(test.db)).active).toBe(false);
    // Too late now: accepting finds no open invitation.
    expect(await accept(test.db, RETURNED)).toEqual({ ok: false, reason: 'no_invitation' });
  });
});

describe('declining, buying, and inviting after the return', () => {
  it('a declined invitation ends and holds nothing', async () => {
    const test = await freshDb();
    const contractId = await ainoLease(test.db);
    await invitePekka(test.db, contractId, '2027-06-01');
    expect(await accept(test.db, '2027-06-02', false)).toEqual({ ok: true, heldNow: false });
    expect((await nomination(test.db)).active).toBe(false);
    await test.cleanup();
  });

  it('an accepted nomination is a promise: no buyout, no early exit — only a return', async () => {
    const test = await freshDb();
    const contractId = await ainoLease(test.db);
    await invitePekka(test.db, contractId, '2027-06-01');
    await accept(test.db, '2027-06-02');
    expect(
      await executeEarlyExit(test.db, {
        contractId,
        actor: 'cust-aino',
        asOf: '2027-07-01',
        usageReadings: { 'ebike-003': 2000 },
      })
    ).toEqual({ ok: false, reason: 'nominated' });
    expect(
      await endOfTerm(test.db, { contractId, action: 'buy', actor: 'cust-aino', asOf: RETURNED })
    ).toEqual({ ok: false, reason: 'nominated' });
    const returned = await endOfTerm(test.db, {
      contractId,
      action: 'return',
      actor: 'cust-aino',
      asOf: RETURNED,
      usageReadings: { 'ebike-003': 4800 },
    });
    expect(returned).toEqual({ ok: true });
    expect((await nomination(test.db)).active).toBe(true);
    await test.cleanup();
  });

  it('a buyout still works while the invitation is unanswered, and ends it', async () => {
    const test = await freshDb();
    const contractId = await ainoLease(test.db);
    await invitePekka(test.db, contractId, '2027-06-01');
    const bought = await endOfTerm(test.db, {
      contractId,
      action: 'buy',
      actor: 'cust-aino',
      asOf: RETURNED,
    });
    expect(bought).toEqual({ ok: true });
    expect((await nomination(test.db)).active).toBe(false);
    await test.cleanup();
  });

  it('invited when the bike is already listed: accepting holds it for 3 days from then', async () => {
    const test = await freshDb();
    const contractId = await ainoLease(test.db);
    await endOfTerm(test.db, {
      contractId,
      action: 'return',
      actor: 'cust-aino',
      asOf: RETURNED,
      usageReadings: { 'ebike-003': 4800 },
    });
    await executeSecondLife(test.db, { assetId: 'ebike-003', actor: 'staff', asOf: RETURNED });
    // Listed for anyone, or offered to the list: invite only matters if it is free.
    const listed = await test.db.asset.findUniqueOrThrow({ where: { id: 'ebike-003' } });
    await invitePekka(test.db, contractId, '2027-11-12');
    expect(await nomination(test.db)).toMatchObject({
      kind: 'nomination_invite',
      until: '2027-11-15',
    });
    const answered = await accept(test.db, '2027-11-13');
    if (listed.status === 'available') {
      expect(answered).toEqual({ ok: true, heldNow: true });
      expect(await nomination(test.db)).toMatchObject({ kind: 'nomination', until: '2027-11-16' });
    } else {
      // Already offered to someone on the waiting list: the invitation cannot override it.
      expect(answered).toEqual({ ok: false, reason: 'no_longer_available' });
    }
    await test.cleanup();
  });
});
