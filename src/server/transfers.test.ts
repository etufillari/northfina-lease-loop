// "Pass it on", end to end: Aino signs a lease, shares the link, Lena takes it over through
// the normal question flow — same locked rent, no down payment — and the nomination route.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { answerQuestion, startApplication, submitApplication } from './applications';
import { seedAssets } from './assets';
import { getContract, signApplication } from './contracts';
import { seedCustomers } from './customers';
import { nominateSuccessor } from './lifecycle';
import { createTransferLink, getTransferOffer, startTransferApplication } from './transfers';

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

async function answerAll(applicationId: string, actor: string, answers: Array<[string, unknown]>) {
  for (const [questionId, value] of answers) {
    const result = await answerQuestion(db, {
      applicationId,
      questionId,
      answer: value as never,
      actor,
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(`${questionId}: ${result.reason}`);
  }
}

describe('mid-lease transfer', () => {
  let contractId = '';
  let token = '';

  it('Aino leases ebike-004 and creates a transfer link', async () => {
    const started = await startApplication(db, {
      assetIds: ['ebike-004'],
      downPaymentCents: 0,
      termMonths: 36,
      customerId: 'cust-aino',
      actor: 'cust-aino',
      asOf: AS_OF,
    });
    if (!started.ok) throw new Error(started.reason);
    await answerAll(started.state.application.id, 'cust-aino', [
      ['q_customer_type', 'consumer'],
      ['q_full_name', 'Aino Virtanen'],
      ['q_birth_date', '1997-04-12'],
      ['q_email', 'aino.virtanen@example.com'],
      ['q_country', 'FI'],
      ['q_employment', 'employed'],
      ['q_monthly_income', 320_000],
      ['q_usage_purpose', 'commuting'],
    ]);
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
    contractId = signed.contractId;

    const link = await createTransferLink(db, { contractId, actor: 'cust-aino', asOf: AS_OF });
    if (!link.ok) throw new Error(link.reason);
    token = link.token;
    // Creating it again re-uses the same token.
    const again = await createTransferLink(db, { contractId, actor: 'cust-aino', asOf: AS_OF });
    expect(again).toEqual({ ok: true, token });
  });

  it('the offer shows the locked lease, and taking over your own lease is refused', async () => {
    const offer = await getTransferOffer(db, token);
    expect(offer?.contract.id).toBe(contractId);
    const own = await startTransferApplication(db, {
      token,
      customerId: 'cust-aino',
      actor: 'cust-aino',
      asOf: AS_OF,
    });
    expect(own).toEqual({ ok: false, reason: 'own_contract' });
  });

  it('Lena applies through the normal flow and the contract moves to her on signing', async () => {
    const applied = await startTransferApplication(db, {
      token,
      customerId: 'cust-lena',
      actor: 'cust-lena',
      asOf: AS_OF,
    });
    if (!applied.ok) throw new Error(applied.reason);

    await answerAll(applied.applicationId, 'cust-lena', [
      ['q_customer_type', 'consumer'],
      ['q_full_name', 'Lena Tamm'],
      ['q_birth_date', '1992-08-03'],
      ['q_email', 'lena.tamm@example.com'],
      ['q_country', 'EE'],
      ['q_employment', 'employed'],
      ['q_monthly_income', 280_000],
      ['q_usage_purpose', 'commuting'],
    ]);
    const submitted = await submitApplication(db, {
      applicationId: applied.applicationId,
      startDate: AS_OF,
      actor: 'cust-lena',
      asOf: AS_OF,
    });
    if (!submitted.ok) throw new Error(submitted.reason);
    expect(submitted.state.application.status).toBe('approved');
    expect(submitted.state.application.isTransfer).toBe(true);

    const signed = await signApplication(db, {
      applicationId: applied.applicationId,
      startDate: AS_OF,
      actor: 'cust-lena',
      asOf: AS_OF,
    });
    if (!signed.ok) throw new Error(signed.reason);
    // The SAME contract, not a new one: the locked schedule carried over.
    expect(signed.contractId).toBe(contractId);

    const contract = await getContract(db, contractId);
    expect(contract).toMatchObject({
      customer_id: 'cust-lena',
      status: 'active',
      transfer_token: null,
    });
    const events = await db.assetEvent.findMany({
      where: { contract_id: contractId, type: 'transferred' },
    });
    expect(events).toHaveLength(1);
    // The dead link is dead.
    expect(await getTransferOffer(db, token)).toBeNull();
  });

  it('nominates a successor by email, skipping the waiting list on the record', async () => {
    const result = await nominateSuccessor(db, {
      contractId,
      email: 'olavi.niemi@example.com',
      actor: 'cust-lena',
      asOf: AS_OF,
    });
    if (!result.ok) throw new Error(result.reason);
    const reservations = await db.reservation.findMany({ where: { kind: 'nomination' } });
    expect(reservations).toHaveLength(1);
    // Provisional until the item comes back: 7 days after the term ends (2029-11-04).
    expect(reservations[0]).toMatchObject({ until: '2029-11-11' });
  });
});
