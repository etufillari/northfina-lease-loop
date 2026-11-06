import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import { createTestDb } from '../../tests/helpers/test-db';
import { startApplication } from './applications';
import { seedAssets } from './assets';
import { seedCustomers } from './customers';
import { listCustomerOpenApplications, nextStepFor } from './customer-applications';

describe('nextStepFor', () => {
  it('maps each open status to what the customer does next', () => {
    expect(nextStepFor('draft', null, '2026-11-05')).toBe('continue');
    expect(nextStepFor('manual_review', '2026-11-12', '2026-11-05')).toBe('wait_for_review');
    expect(nextStepFor('approved', '2026-11-12', '2026-11-05')).toBe('sign');
    expect(nextStepFor('awaiting_signature', '2026-11-12', '2026-11-05')).toBe(
      'wait_for_signatory'
    );
  });

  it('the hold includes its last day, and is over the day after', () => {
    expect(nextStepFor('approved', '2026-11-12', '2026-11-12')).toBe('sign');
    expect(nextStepFor('approved', '2026-11-12', '2026-11-13')).toBe('expired');
    expect(nextStepFor('awaiting_signature', '2026-11-12', '2026-11-13')).toBe('expired');
  });

  it('a manual review never expires from the customer side: a person still has to look', () => {
    expect(nextStepFor('manual_review', '2026-11-12', '2026-12-01')).toBe('wait_for_review');
  });

  it('an approval without a hold date can still be signed', () => {
    expect(nextStepFor('approved', null, '2027-01-01')).toBe('sign');
  });
});

describe('listCustomerOpenApplications', () => {
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

  async function start(assetId: string, customerId = 'cust-aino') {
    const result = await startApplication(db, {
      assetIds: [assetId],
      downPaymentCents: 0,
      termMonths: 36,
      customerId,
      actor: customerId,
      asOf: '2026-11-05',
    });
    if (!result.ok) throw new Error(result.reason);
    return result.state.application.id;
  }

  it('is empty for a customer with no applications', async () => {
    expect(await listCustomerOpenApplications(db, 'cust-aino', '2026-11-05')).toEqual([]);
  });

  it('lists open applications with the next step, actionable ones first', async () => {
    const draft = await start('ebike-001');
    const review = await start('ebike-002');
    const approved = await start('ebike-003');
    const signed = await start('ebike-005');
    const declined = await start('ebike-006');
    const other = await start('laptop-001', 'cust-norvi');
    // Set the statuses directly: this test is about the listing, not the decision.
    const set = (id: string, status: string, hold_until: string | null = null) =>
      db.application.update({ where: { id }, data: { status, hold_until } });
    await set(review, 'manual_review', '2026-11-12');
    await set(approved, 'approved', '2026-11-12');
    await set(signed, 'signed');
    await set(declined, 'declined');

    const list = await listCustomerOpenApplications(db, 'cust-aino', '2026-11-06');
    const ids = list.map((a) => a.applicationId);
    expect(ids).not.toContain(signed);
    expect(ids).not.toContain(declined);
    expect(ids).not.toContain(other);
    expect(new Set(ids)).toEqual(new Set([draft, review, approved]));
    // The two the customer can act on come before the one waiting for a person.
    expect(list.at(-1)).toMatchObject({ applicationId: review, nextStep: 'wait_for_review' });
    expect(list.find((a) => a.applicationId === approved)).toMatchObject({
      status: 'approved',
      nextStep: 'sign',
      holdUntil: '2026-11-12',
      assets: [{ id: 'ebike-003', name: expect.any(String) }],
      termMonths: 36,
      isTransfer: false,
    });
    expect(list.find((a) => a.applicationId === draft)?.nextStep).toBe('continue');
  });

  it('marks an approval whose hold ran out as expired', async () => {
    const list = await listCustomerOpenApplications(db, 'cust-aino', '2026-11-13');
    expect(list.find((a) => a.status === 'approved')?.nextStep).toBe('expired');
  });
});
