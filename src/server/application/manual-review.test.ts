// Runs against a real, migrated SQLite database (see tests/global-setup.ts).
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ainoEbikeAnswers, haapalaFarmAnswers } from '../../../tests/helpers/applicants';
import { applyFor, resetLeaseData } from '../../../tests/helpers/lease-flow';
import { createTestDb } from '../../../tests/helpers/test-db';
import type { PrismaClient } from '../prisma-client';
import { reviewApplication } from './applications';
import { manualReviewCases } from './manual-review';

let db: PrismaClient;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});
afterAll(async () => {
  await cleanup();
});
beforeEach(async () => {
  await resetLeaseData(db);
});

const applyHaapala = () =>
  applyFor(db, 'cust-haapala', 'farm-002', haapalaFarmAnswers, {
    termMonths: 48,
    downPaymentCents: 2_000_000,
  });

describe('manualReviewCases', () => {
  it('gives a reviewer the big-ticket case in full (card 7)', async () => {
    const application = await applyHaapala();
    const [reviewCase] = await manualReviewCases(db, 'en');

    expect(reviewCase).toMatchObject({
      id: application.id,
      customer_name: 'Haapalan Tila Oy',
      customer_type: 'company',
      term_months: 48,
      down_payment_cents: 2_000_000,
      reasons: ['pep_manual_review'],
    });
    expect(reviewCase?.asset_name).not.toBe('farm-002');
  });

  it('shows a recorded PEP even when the customer answered no', async () => {
    await applyHaapala();
    const [reviewCase] = await manualReviewCases(db, 'en');

    expect(reviewCase?.recorded_pep).toBe(true);
    expect(reviewCase?.answers.find(({ id }) => id === 'q_pep')?.value).toBe('no');
  });

  it('gives the questions in the language of the page', async () => {
    await applyHaapala();
    const [reviewCase] = await manualReviewCases(db, 'fi');

    expect(reviewCase?.answers.find(({ id }) => id === 'q_email')?.text).toBe('Sähköpostiosoite');
  });

  it('leaves out applications no person needs to look at', async () => {
    await applyFor(db, 'cust-aino', 'ebike-003', ainoEbikeAnswers);
    expect(await manualReviewCases(db, 'en')).toEqual([]);
  });

  it('drops a case once it has been decided', async () => {
    const application = await applyHaapala();
    await reviewApplication(db, { id: application.id, decision: 'approved', actor: 'staff-admin' });

    expect(await manualReviewCases(db, 'en')).toEqual([]);
  });
});
