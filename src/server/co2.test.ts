// Who gets the CO2 credit (src/server/co2.ts): the customer whose lease starts a life.
// A first life credits nobody; a take-over mid-life is NOT a new life, so the credit
// stays with the first lessee of that life.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { ainoScript, applyAndSubmit } from '../../tests/helpers/apply-and-submit';
import { createTestDb } from '../../tests/helpers/test-db';
import { answerQuestion, submitApplication } from './applications';
import { seedAssets } from './assets';
import { co2SavedFor } from './co2';
import { signApplication } from './contracts';
import { seedCustomers } from './customers';
import { endOfTerm } from './lifecycle';
import { executeSecondLife } from './second-life';
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

const SIGNED = '2026-11-05';
const RETURNED = '2027-11-05';
const RELEASED = '2027-11-20';

const lenaScript = {
  ...ainoScript,
  q_full_name: 'Lena Tamm',
  q_birth_date: '1992-08-03',
  q_email: 'lena.tamm@example.com',
};

async function lease(assetId: string, customerId: string, script: typeof ainoScript, asOf: string) {
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

describe('co2SavedFor', () => {
  it('a first life credits nobody; the second life credits the lease that starts it', async () => {
    // Life 1: Aino leases the new bike and returns it after the term.
    const contractId = await lease('ebike-003', 'cust-aino', ainoScript, SIGNED);
    expect((await co2SavedFor(db, 'cust-aino')).totalKg).toBe(0);
    const ended = await endOfTerm(db, {
      contractId,
      action: 'return',
      actor: 'cust-aino',
      asOf: RETURNED,
      usageReadings: { 'ebike-003': 4800 },
    });
    expect(ended).toEqual({ ok: true });

    // The desk refurbishes (life 2 starts, kg recorded) and Lena leases it.
    const executed = await executeSecondLife(db, {
      assetId: 'ebike-003',
      actor: 'staff',
      asOf: RELEASED,
    });
    if (!executed.ok) throw new Error(executed.reason);
    expect(executed.co2AvoidedKg).toBeGreaterThan(0);
    await lease('ebike-003', 'cust-lena', lenaScript, RELEASED);

    const lena = await co2SavedFor(db, 'cust-lena');
    expect(lena.totalKg).toBeCloseTo(executed.co2AvoidedKg!, 5);
    expect(lena.credits).toHaveLength(1);
    expect(lena.credits[0]).toMatchObject({ assetId: 'ebike-003', life: 2, onDate: RELEASED });
    // Aino made the return possible but leased the bike new: no credit for life 1.
    expect((await co2SavedFor(db, 'cust-aino')).totalKg).toBe(0);
  });

  it('a mid-life take-over is not a new life: the credit stays with the first lessee', async () => {
    const contract = await db.contract.findFirstOrThrow({
      where: { customer_id: 'cust-lena' },
      orderBy: { created_at: 'desc' },
    });
    const link = await createTransferLink(db, {
      contractId: contract.id,
      actor: 'cust-lena',
      asOf: '2027-12-01',
    });
    if (!link.ok) throw new Error(link.reason);
    const applied = await startTransferApplication(db, {
      token: link.token,
      customerId: 'cust-olavi',
      actor: 'cust-olavi',
      asOf: '2027-12-01',
    });
    if (!applied.ok) throw new Error(applied.reason);
    let state = (await answerQuestion(db, {
      applicationId: applied.applicationId,
      questionId: 'q_customer_type',
      answer: 'consumer',
      actor: 'cust-olavi',
      asOf: '2027-12-01',
    })) as { ok: true; state: { nextQuestionId: string | null } };
    const olaviScript = {
      ...ainoScript,
      q_full_name: 'Olavi Niemi',
      q_birth_date: '1958-02-14',
      q_email: 'olavi.niemi@example.com',
    };
    while (state.state.nextQuestionId) {
      const next = state.state.nextQuestionId;
      state = (await answerQuestion(db, {
        applicationId: applied.applicationId,
        questionId: next,
        answer: olaviScript[next as keyof typeof olaviScript] as never,
        actor: 'cust-olavi',
        asOf: '2027-12-01',
      })) as typeof state;
    }
    await submitApplication(db, {
      applicationId: applied.applicationId,
      startDate: '2027-12-01',
      actor: 'cust-olavi',
      asOf: '2027-12-01',
    });
    const signed = await signApplication(db, {
      applicationId: applied.applicationId,
      startDate: '2027-12-01',
      actor: 'cust-olavi',
      asOf: '2027-12-01',
    });
    if (!signed.ok) throw new Error(signed.reason);

    // Olavi holds the lease now, but Lena started this life: her credit, not his.
    expect((await co2SavedFor(db, 'cust-olavi')).totalKg).toBe(0);
    expect((await co2SavedFor(db, 'cust-lena')).totalKg).toBeGreaterThan(0);
  });

  it('an item that arrived used with no history credits its first lessee, as 6 months of use', async () => {
    // laptop-009: like_new, previous_lives 1 in the data pack, no refurbishment recorded.
    await lease('laptop-009', 'cust-aino', ainoScript, SIGNED);
    const aino = await co2SavedFor(db, 'cust-aino');
    expect(aino.credits).toHaveLength(1);
    expect(aino.credits[0]).toMatchObject({ assetId: 'laptop-009', life: 2, onDate: SIGNED });
    expect(aino.totalKg).toBeGreaterThan(0);
    // Nothing is stored on the asset.
    const row = await db.asset.findUniqueOrThrow({ where: { id: 'laptop-009' } });
    expect(row.previous_lives).toBe(1);
  });
});
