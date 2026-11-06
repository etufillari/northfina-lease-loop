// Regression tests for the second round of clicking through the app: one persona acting on
// another customer's lease or application, a double-clicked signature, and who pays which
// invoice when a lease changes hands two months in, or on its very first day.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { answerQuestion, startApplication, submitApplication } from './applications';
import { seedAssets } from './assets';
import { invoicesFor, signApplication } from './contracts';
import { seedCustomers } from './customers';
import { executeEarlyExit, nominateSuccessor, setBuyoutOption } from './lifecycle';
import { approveApplication } from './staff';
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

const START = '2026-11-05';
const lenaScript = {
  ...ainoScript,
  q_full_name: 'Lena Tamm',
  q_birth_date: '1992-08-03',
  q_email: 'lena.tamm@example.com',
};

/** A signed 12-month lease for `customerId` on `assetId`, starting `asOf`. */
async function lease(assetId: string, customerId: string, script = ainoScript, asOf = START) {
  const state = await applyAndSubmit(db, {
    customerId,
    assetIds: [assetId],
    downPaymentCents: 0,
    termMonths: 12,
    script,
    asOf,
  });
  const signed = await signApplication(db, {
    applicationId: state.application.id,
    startDate: asOf,
    actor: customerId,
    asOf,
  });
  if (!signed.ok) throw new Error(signed.reason);
  return signed.contractId;
}

/** Lena takes over `contractId` through its link on `asOf`. */
async function lenaTakesOver(contractId: string, asOf: string) {
  const link = await createTransferLink(db, { contractId, actor: 'cust-aino', asOf });
  if (!link.ok) throw new Error(link.reason);
  const applied = await startTransferApplication(db, {
    token: link.token,
    customerId: 'cust-lena',
    actor: 'cust-lena',
    asOf,
  });
  if (!applied.ok) throw new Error(applied.reason);
  let state = (await answerQuestion(db, {
    applicationId: applied.applicationId,
    questionId: 'q_customer_type',
    answer: 'consumer',
    actor: 'cust-lena',
    asOf,
  })) as { ok: true; state: { nextQuestionId: string | null } };
  while (state.state.nextQuestionId) {
    const next = state.state.nextQuestionId;
    state = (await answerQuestion(db, {
      applicationId: applied.applicationId,
      questionId: next,
      answer: lenaScript[next as keyof typeof lenaScript] as never,
      actor: 'cust-lena',
      asOf,
    })) as typeof state;
  }
  await submitApplication(db, {
    applicationId: applied.applicationId,
    startDate: asOf,
    actor: 'cust-lena',
    asOf,
  });
  const signed = await signApplication(db, {
    applicationId: applied.applicationId,
    startDate: asOf,
    actor: 'cust-lena',
    asOf,
  });
  if (!signed.ok) throw new Error(signed.reason);
}

describe('nobody acts on someone else’s lease or application', () => {
  it('Olavi cannot end, buy out, pass on or nominate for Aino’s lease', async () => {
    const contractId = await lease('ebike-003', 'cust-aino');
    const asOlavi = { contractId, actor: 'cust-olavi', asOf: '2027-01-10' };
    expect(await executeEarlyExit(db, asOlavi)).toEqual({ ok: false, reason: 'not_yours' });
    expect(await setBuyoutOption(db, { ...asOlavi, optIn: true })).toEqual({
      ok: false,
      reason: 'not_yours',
    });
    expect(await createTransferLink(db, asOlavi)).toEqual({ ok: false, reason: 'not_yours' });
    expect(await nominateSuccessor(db, { ...asOlavi, email: 'olavi.niemi@example.com' })).toEqual({
      ok: false,
      reason: 'not_yours',
    });
  });

  it('Olavi cannot start, answer, submit or sign an application in Lena’s name', async () => {
    const deal = { assetIds: ['ebike-004'], downPaymentCents: 0, termMonths: 12, asOf: START };
    expect(
      await startApplication(db, { ...deal, customerId: 'cust-lena', actor: 'cust-olavi' })
    ).toEqual({ ok: false, reason: 'not_yours' });

    const started = await startApplication(db, {
      ...deal,
      customerId: 'cust-lena',
      actor: 'cust-lena',
    });
    if (!started.ok) throw new Error(started.reason);
    const applicationId = started.state.application.id;
    expect(
      await answerQuestion(db, {
        applicationId,
        questionId: 'q_customer_type',
        answer: 'consumer',
        actor: 'cust-olavi',
        asOf: START,
      })
    ).toEqual({ ok: false, reason: 'not_yours' });
    expect(
      await submitApplication(db, {
        applicationId,
        startDate: START,
        actor: 'cust-olavi',
        asOf: START,
      })
    ).toEqual({ ok: false, reason: 'not_yours' });
  });

  it('a customer persona cannot approve a manual review: that is staff work', async () => {
    const state = await applyAndSubmit(db, {
      customerId: 'cust-lena',
      assetIds: ['ebike-005'],
      downPaymentCents: 0,
      termMonths: 12,
      script: lenaScript,
      asOf: START,
    });
    await db.application.update({
      where: { id: state.application.id },
      data: { status: 'manual_review' },
    });
    expect(
      await approveApplication(db, {
        applicationId: state.application.id,
        actor: 'cust-olavi',
        asOf: START,
      })
    ).toEqual({ ok: false, reason: 'staff_only' });
  });
});

describe('signing twice', () => {
  it('a double-click signs once: the second request is refused cleanly, not a crash', async () => {
    const state = await applyAndSubmit(db, {
      customerId: 'cust-aino',
      assetIds: ['ebike-006'],
      downPaymentCents: 0,
      termMonths: 12,
      script: ainoScript,
      asOf: START,
    });
    const sign = () =>
      signApplication(db, {
        applicationId: state.application.id,
        startDate: START,
        actor: 'cust-aino',
        asOf: START,
      });
    const results = await Promise.all([sign(), sign()]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, reason: 'not_signable' }]);
    expect(await db.contractAsset.count({ where: { asset_id: 'ebike-006' } })).toBe(1);
  });

  it('the start date approved at submission is the one signed, whatever the request says', async () => {
    const state = await applyAndSubmit(db, {
      customerId: 'cust-aino',
      assetIds: ['laptop-001'],
      downPaymentCents: 0,
      termMonths: 12,
      script: ainoScript,
      asOf: START,
    });
    const signed = await signApplication(db, {
      applicationId: state.application.id,
      startDate: '2027-01-20',
      actor: 'cust-aino',
      asOf: START,
    });
    if (!signed.ok) throw new Error(signed.reason);
    const contract = await db.contract.findUniqueOrThrow({ where: { id: signed.contractId } });
    expect(contract.start_date).toBe(START);
  });
});

describe('who pays which invoice when a lease changes hands', () => {
  it('two months in: the first two months stay Aino’s, the rest are Lena’s', async () => {
    const contractId = await lease('laptop-002', 'cust-aino');
    // Invoices are due on the 5th; on 4 Jan two have been billed (Nov, Dec).
    await lenaTakesOver(contractId, '2027-01-04');
    const contract = await db.contract.findUniqueOrThrow({
      where: { id: contractId },
      include: { invoices: { orderBy: { number: 'asc' } } },
    });
    expect(contract.customer_id).toBe('cust-lena');
    expect(invoicesFor(contract, 'cust-aino').map((i) => i.number)).toEqual([1, 2]);
    expect(invoicesFor(contract, 'cust-lena').map((i) => i.number)).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('on the very first day: Aino owes nothing, Lena takes every month', async () => {
    const contractId = await lease('laptop-003', 'cust-aino');
    await lenaTakesOver(contractId, START);
    const contract = await db.contract.findUniqueOrThrow({
      where: { id: contractId },
      include: { invoices: true },
    });
    expect(invoicesFor(contract, 'cust-aino')).toEqual([]);
    expect(invoicesFor(contract, 'cust-lena')).toHaveLength(12);
  });
});
