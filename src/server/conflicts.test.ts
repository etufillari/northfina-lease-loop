// Regression tests for the conflicts found by clicking through the app: two customers racing
// for one item, two people taking over one lease, and a lessee who buys, nominates and
// passes on at the same time. Each scenario reproduced a real bug before the fix.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import {
  answerQuestion,
  cancelApplication,
  getApplicationState,
  startApplication,
  submitApplication,
} from './applications';
import { answerNomination } from './nominations';
import { approveApplication } from './staff';
import { seedAssets } from './assets';
import { getContract, signApplication } from './contracts';
import { seedCustomers } from './customers';
import { endOfTerm, nominateSuccessor, setBuyoutOption, termEndsOn } from './lifecycle';
import { executeSecondLife, previewSecondLife } from './second-life';
import { createTransferLink, startTransferApplication } from './transfers';

let db: Awaited<ReturnType<typeof createTestDb>>['db'];
let cleanup: () => Promise<void>;
beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  await seedAssets(db, await loadAssets());
  await seedCustomers(db, await loadCustomers());
});
afterAll(async () => {
  await cleanup();
});

const AS_OF = '2026-11-05';

/** Answers that pass for every consumer persona used here. */
const PROFILES: Record<string, Record<string, unknown>> = {
  'cust-aino': {
    q_full_name: 'Aino Virtanen',
    q_birth_date: '1997-04-12',
    q_email: 'aino.virtanen@example.com',
  },
  'cust-olavi': {
    q_full_name: 'Olavi Niemi',
    q_birth_date: '1956-06-18',
    q_email: 'olavi.niemi@example.com',
  },
  'cust-lena': {
    q_full_name: 'Lena Tamm',
    q_birth_date: '1992-08-03',
    q_email: 'lena.tamm@example.com',
  },
  'cust-sanna': {
    q_full_name: 'Sanna Mäkelä',
    q_birth_date: '1990-02-20',
    q_email: 'sanna.makela@example.com',
  },
};
const COMMON: Record<string, unknown> = {
  q_customer_type: 'consumer',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 400_000,
  q_usage_purpose: 'commuting',
  q_pep: 'no',
};

/** Answers whatever the flow asks next until nothing is left, like a customer would. */
async function answerAll(applicationId: string, customerId: string, asOf = AS_OF) {
  const answers = { ...COMMON, ...PROFILES[customerId] };
  for (let i = 0; i < 30; i++) {
    const state = await getApplicationState(db, applicationId, asOf);
    const next = state!.nextQuestionId;
    if (next === null) return;
    const result = await answerQuestion(db, {
      applicationId,
      questionId: next,
      answer: answers[next] as never,
      actor: customerId,
      asOf,
    });
    if (!result.ok) throw new Error(`${next}: ${result.reason}`);
  }
  throw new Error('question flow did not finish');
}

async function draft(assetId: string, customerId: string, asOf = AS_OF, termMonths = 12) {
  const started = await startApplication(db, {
    assetIds: [assetId],
    downPaymentCents: 0,
    termMonths,
    customerId,
    actor: customerId,
    asOf,
  });
  if (!started.ok) throw new Error(started.reason);
  await answerAll(started.state.application.id, customerId, asOf);
  return started.state.application.id;
}

const submit = (applicationId: string, customerId: string, asOf = AS_OF) =>
  submitApplication(db, { applicationId, startDate: asOf, actor: customerId, asOf });
const sign = (applicationId: string, customerId: string, asOf = AS_OF) =>
  signApplication(db, { applicationId, startDate: asOf, actor: customerId, asOf });

/** A signed 12-month lease for `customerId` on `assetId`, starting AS_OF. */
async function lease(assetId: string, customerId: string) {
  const id = await draft(assetId, customerId);
  const submitted = await submit(id, customerId);
  if (!submitted.ok) throw new Error(submitted.reason);
  const signed = await sign(id, customerId);
  if (!signed.ok) throw new Error(signed.reason);
  return signed.contractId;
}

describe('two customers racing for one item', () => {
  it('once Olavi is approved, Aino cannot submit for the same item', async () => {
    const aino = await draft('ebike-003', 'cust-aino');
    const olavi = await draft('ebike-003', 'cust-olavi');
    const first = await submit(olavi, 'cust-olavi');
    expect(first.ok && first.state.application.status).toBe('approved');

    expect(await submit(aino, 'cust-aino')).toEqual({ ok: false, reason: 'asset_unavailable' });
    // Her draft is untouched: she can pick another item.
    const state = await getApplicationState(db, aino, AS_OF);
    expect(state?.application.status).toBe('draft');
  });

  it('signing re-checks the item: one physical item, one contract', async () => {
    // Force a stale approval for Aino alongside Olavi's, as the old code allowed.
    const aino = (await db.application.findFirst({
      where: { customer_id: 'cust-aino', status: 'draft' },
    }))!.id;
    await db.application.update({
      where: { id: aino },
      data: { status: 'approved', hold_until: '2026-11-12', start_date: AS_OF },
    });
    const olavi = (await db.application.findFirst({
      where: { customer_id: 'cust-olavi', status: 'approved' },
    }))!.id;

    expect((await sign(olavi, 'cust-olavi')).ok).toBe(true);
    expect(await sign(aino, 'cust-aino')).toEqual({ ok: false, reason: 'asset_unavailable' });
    const contracts = await db.contractAsset.count({ where: { asset_id: 'ebike-003' } });
    expect(contracts).toBe(1);
  });

  it('staff cannot approve a manual review for an item someone else has signed for', async () => {
    const pending = await draft('ebike-004', 'cust-lena');
    await db.application.update({ where: { id: pending }, data: { status: 'manual_review' } });
    await lease('ebike-004', 'cust-sanna');
    expect(
      await approveApplication(db, { applicationId: pending, actor: 'staff', asOf: AS_OF })
    ).toEqual({ ok: false, reason: 'asset_unavailable' });
  });
});

describe('taking over a lease', () => {
  let contractId = '';
  let token = '';
  let lena = '';
  let sanna = '';

  it('approving a take-over leaves the leased item leased and out of the catalogue', async () => {
    contractId = await lease('ebike-005', 'cust-aino');
    expect((await setBuyoutOption(db, { contractId, optIn: true, actor: 'cust-aino' })).ok).toBe(
      true
    );
    const link = await createTransferLink(db, { contractId, actor: 'cust-aino', asOf: AS_OF });
    if (!link.ok) throw new Error(link.reason);
    token = link.token;

    for (const customerId of ['cust-lena', 'cust-sanna']) {
      const applied = await startTransferApplication(db, {
        token,
        customerId,
        actor: customerId,
        asOf: AS_OF,
      });
      if (!applied.ok) throw new Error(applied.reason);
      await answerAll(applied.applicationId, customerId);
      const submitted = await submit(applied.applicationId, customerId);
      expect(submitted.ok && submitted.state.application.status).toBe('approved');
      // The summary shows what is left of the lease, not the whole term. The first
      // month's invoice was issued today, so it stays with the current lessee.
      expect(submitted.ok && submitted.state.quote.takeOver?.monthsLeft).toBe(11);
      if (customerId === 'cust-lena') lena = applied.applicationId;
      else sanna = applied.applicationId;
    }

    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-005' } });
    expect(asset.status).toBe('leased');
    expect(await db.reservation.count({ where: { asset_id: 'ebike-005', active: true } })).toBe(0);
  });

  it('cancelling a take-over never frees the leased item', async () => {
    const extra = await startTransferApplication(db, {
      token,
      customerId: 'cust-olavi',
      actor: 'cust-olavi',
      asOf: AS_OF,
    });
    if (!extra.ok) throw new Error(extra.reason);
    await answerAll(extra.applicationId, 'cust-olavi');
    await submit(extra.applicationId, 'cust-olavi');
    const cancelled = await cancelApplication(db, {
      applicationId: extra.applicationId,
      actor: 'cust-olavi',
      asOf: AS_OF,
    });
    expect(cancelled.ok).toBe(true);
    const asset = await db.asset.findUniqueOrThrow({ where: { id: 'ebike-005' } });
    expect(asset.status).toBe('leased');
  });

  it('one take-over per link: the second approved applicant cannot take it from the first', async () => {
    const first = await sign(sanna, 'cust-sanna');
    expect(first).toEqual({ ok: true, contractId });

    const contract = await getContract(db, contractId);
    // Aino's "buy at the end" was hers, not Sanna's.
    expect(contract).toMatchObject({ customer_id: 'cust-sanna', purchase_at_end: false });
    // Lena's approval was closed in the same transaction...
    const lenaApp = await db.application.findUniqueOrThrow({ where: { id: lena } });
    expect(lenaApp.status).toBe('cancelled');
    // ...so her signature cannot move the lease again.
    expect((await sign(lena, 'cust-lena')).ok).toBe(false);
    expect((await getContract(db, contractId))?.customer_id).toBe('cust-sanna');
  });

  it('no take-over once the term is over', async () => {
    const lastDay = termEndsOn((await getContract(db, contractId))!);
    expect(
      await createTransferLink(db, { contractId, actor: 'cust-sanna', asOf: lastDay })
    ).toEqual({ ok: false, reason: 'term_over' });
  });
});

describe('end of term: buying, nominating and the second-life desk', () => {
  let contractId = '';
  let lastDay = '';

  it('nominations follow the rules: not yourself, not a stranger, not while buying', async () => {
    contractId = await lease('ebike-006', 'cust-aino');
    lastDay = termEndsOn((await getContract(db, contractId))!);
    const nominate = (email: string, asOf = AS_OF) =>
      nominateSuccessor(db, { contractId, email, actor: 'cust-aino', asOf });

    expect(await nominate('aino.virtanen@example.com')).toEqual({
      ok: false,
      reason: 'self_nomination',
    });
    expect(await nominate('nobody@example.com')).toEqual({ ok: false, reason: 'unknown_nominee' });

    await setBuyoutOption(db, { contractId, optIn: true, actor: 'cust-aino' });
    expect(await nominate('olavi.niemi@example.com')).toEqual({ ok: false, reason: 'buying' });
    await setBuyoutOption(db, { contractId, optIn: false, actor: 'cust-aino' });
  });

  it('nominating again replaces the earlier nomination, and blocks "buy at the end"', async () => {
    for (const email of ['olavi.niemi@example.com', 'sanna.makela@example.com']) {
      const result = await nominateSuccessor(db, {
        contractId,
        email,
        actor: 'cust-aino',
        asOf: AS_OF,
      });
      expect(result.ok).toBe(true);
    }
    const active = await db.reservation.findMany({
      where: {
        asset_id: 'ebike-006',
        kind: { in: ['nomination', 'nomination_invite'] },
        active: true,
      },
    });
    expect(active.map((r) => r.customer_id)).toEqual(['cust-sanna']);
    // Sanna accepts, so the item will be held for her once it is ready.
    const accepted = await answerNomination(db, {
      assetId: 'ebike-006',
      customerId: 'cust-sanna',
      accept: true,
      asOf: AS_OF,
    });
    expect(accepted).toEqual({ ok: true, heldNow: false });
    expect(await setBuyoutOption(db, { contractId, optIn: true, actor: 'cust-aino' })).toEqual({
      ok: false,
      reason: 'nominated',
    });
  });

  it('after the return: nobody can lease it at the desk; after the work it is the nominee’s alone', async () => {
    expect(
      await endOfTerm(db, {
        contractId,
        action: 'return',
        actor: 'cust-aino',
        asOf: lastDay,
        usageReadings: { 'ebike-006': 900 },
      })
    ).toEqual({ ok: true });
    const tryLease = (customerId: string) =>
      startApplication(db, {
        assetIds: ['ebike-006'],
        downPaymentCents: 0,
        termMonths: 12,
        customerId,
        actor: customerId,
        asOf: lastDay,
      });
    // At the desk, in maintenance: not even the nominee yet.
    expect(await tryLease('cust-sanna')).toEqual({ ok: false, reason: 'asset_unavailable' });

    const desk = await previewSecondLife(db, 'ebike-006', lastDay);
    expect(desk.ok && desk.preview.outcome.kind).toBe('nominee');
    const executed = await executeSecondLife(db, {
      assetId: 'ebike-006',
      actor: 'staff',
      asOf: lastDay,
    });
    expect(executed.ok && executed.applied).toBe('nominee');

    expect(await tryLease('cust-lena')).toEqual({ ok: false, reason: 'asset_unavailable' });
    expect((await tryLease('cust-sanna')).ok).toBe(true);
  });

  it('buying at the end ends any nomination: a sold item cannot pass to a successor', async () => {
    const bought = await lease('laptop-001', 'cust-olavi');
    const end = termEndsOn((await getContract(db, bought))!);
    await nominateSuccessor(db, {
      contractId: bought,
      email: 'lena.tamm@example.com',
      actor: 'cust-olavi',
      asOf: end,
    });
    expect(
      await endOfTerm(db, { contractId: bought, action: 'buy', actor: 'cust-olavi', asOf: end })
    ).toEqual({ ok: true });
    expect(
      await db.reservation.count({
        where: { asset_id: 'laptop-001', kind: 'nomination', active: true },
      })
    ).toBe(0);
  });
});
