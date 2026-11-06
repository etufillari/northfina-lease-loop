import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../tests/helpers/test-db';
import { seedAssets } from './assets';
import { createApplicationPreview, type ApplicationPreviewRequest } from './applications';
import type { PrismaClient } from './prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let dataPack: Asset[];

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  dataPack = await loadAssets();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.asset.deleteMany();
  await seedAssets(db, dataPack);
});

const request: ApplicationPreviewRequest = {
  assetId: 'ebike-003',
  date: '2026-11-05',
  downPaymentCents: 0,
  termMonths: 36,
  answers: {},
};

const completeConsumerAnswers = {
  q_customer_type: 'consumer',
  q_full_name: 'Aino Virtanen',
  q_birth_date: '1997-04-12',
  q_email: 'aino@example.com',
  q_country: 'FI',
  q_employment: 'employed',
  q_monthly_income: 320_000,
  q_usage_purpose: 'commuting',
};

describe('createApplicationPreview', () => {
  it('returns the quote and initial questions with explanations', async () => {
    const result = await createApplicationPreview(db, request);

    expect(result).toMatchObject({
      ok: true,
      preview: {
        quote: { pricing: { monthlyNetRentCents: 10_730 } },
        application: {
          decision: 'incomplete',
          activeQuestions: [
            { id: 'q_customer_type', why_we_ask: { en: 'Everything else depends on this.' } },
            { id: 'q_email' },
            { id: 'q_usage_purpose' },
          ],
          nextQuestionId: 'q_customer_type',
        },
      },
    });
  });

  it('approves a complete affordable application using the recalculated gross rent', async () => {
    const result = await createApplicationPreview(db, {
      ...request,
      answers: completeConsumerAnswers,
    });

    expect(result).toMatchObject({
      ok: true,
      preview: { application: { decision: 'approved', reasons: [] } },
    });
  });

  it('recalculates active questions and discards stale answers after a change', async () => {
    const result = await createApplicationPreview(db, {
      ...request,
      answers: {
        ...completeConsumerAnswers,
        q_customer_type: 'company',
        q_business_id: '3012456-5',
        q_company_name: 'Example Oy',
        q_can_sign: 'yes',
        q_vat_registered: 'yes',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      preview: {
        application: {
          decision: 'approved',
          discardedAnswerIds: [
            'q_full_name',
            'q_birth_date',
            'q_country',
            'q_employment',
            'q_monthly_income',
          ],
          retainedAnswers: {
            q_customer_type: 'company',
            q_business_id: '3012456-5',
          },
        },
      },
    });
  });

  it('passes quote failures through without writing data', async () => {
    await db.asset.update({ where: { id: request.assetId }, data: { status: 'reserved' } });

    await expect(createApplicationPreview(db, request)).resolves.toEqual({
      ok: false,
      reason: 'asset_unavailable',
      status: 'reserved',
    });
    expect(await db.auditLog.count()).toBe(0);
  });
});
