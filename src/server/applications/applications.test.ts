import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets, loadCustomers } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../../tests/helpers/test-db';
import { seedAssets } from '../assets/assets';
import { seedCustomers } from '../assets/customers';
import {
  applicationPreviewRequestSchema,
  applicationSubmissionRequestSchema,
  createApplication,
  createApplicationPreview,
  type ApplicationPreviewRequest,
  type ApplicationSubmissionRequest,
} from './applications';
import type { PrismaClient } from '../prisma-client';

let db: PrismaClient;
let cleanup: () => Promise<void>;
let dataPack: Asset[];
let customerData: Awaited<ReturnType<typeof loadCustomers>>;

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
  dataPack = await loadAssets();
  customerData = await loadCustomers();
});

afterAll(async () => {
  await cleanup();
});

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.application.deleteMany();
  await db.customer.deleteMany();
  await db.asset.deleteMany();
  await seedCustomers(db, customerData);
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

const completeSubmission: ApplicationSubmissionRequest = {
  customerId: 'cust-aino',
  actor: 'team-test',
  ...request,
  answers: completeConsumerAnswers,
};

describe('createApplicationPreview', () => {
  it('validates email answers in the request schema', () => {
    expect(
      applicationPreviewRequestSchema.safeParse({ ...request, answers: { q_email: 'bad' } }).success
    ).toBe(false);
    expect(
      applicationPreviewRequestSchema.safeParse({
        ...request,
        answers: { q_signatory_email: 'bad' },
      }).success
    ).toBe(false);
    expect(
      applicationPreviewRequestSchema.safeParse({
        ...request,
        answers: { q_email: 'good@example.com' },
      }).success
    ).toBe(true);
    expect(
      applicationSubmissionRequestSchema.safeParse({
        ...completeSubmission,
        answers: { q_email: 'bad' },
      }).success
    ).toBe(false);
  });
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

describe('createApplication', () => {
  it('persists an approved application with customer, audit, and pricing snapshots', async () => {
    const result = await createApplication(db, completeSubmission);

    expect(result).toMatchObject({
      ok: true,
      application: {
        customerId: 'cust-aino',
        assetId: 'ebike-003',
        decision: 'approved',
        answers: completeConsumerAnswers,
        pricingSnapshot: {
          pricing: {
            monthlyNetRentCents: 10_730,
            totalCostWithBuyoutCents: 444_630,
          },
        },
      },
    });

    const row = await db.application.findUniqueOrThrow({
      where: { id: result.ok ? result.application.id : '' },
    });
    expect(row).toMatchObject({
      customer_id: 'cust-aino',
      asset_id: 'ebike-003',
      status: 'approved',
      coefficient_factor_ppm: 27_584,
      monthly_net_rent_cents: 10_730,
      buyout_cents: 58_350,
    });
    expect(JSON.parse(row.pricing_snapshot_json ?? '')).toMatchObject({
      sources: { priceListVersion: 1, coefficientTableVersion: 1 },
    });
    expect(await db.auditLog.findFirstOrThrow()).toMatchObject({
      action: 'application.submitted',
      entity_type: 'application',
      entity_id: row.id,
      actor: 'team-test',
    });
  });

  it('persists a rejected application and its reasons', async () => {
    const result = await createApplication(db, {
      ...completeSubmission,
      customerId: 'cust-mikko',
      answers: {
        ...completeConsumerAnswers,
        q_full_name: 'Mikko Laine',
        q_birth_date: '2009-03-10',
        q_email: 'mikko@example.com',
        q_monthly_income: 40_000,
      },
    });

    expect(result).toMatchObject({
      ok: true,
      application: {
        decision: 'rejected',
        reasons: expect.arrayContaining([
          { code: 'age_under_minimum', questionId: 'q_birth_date' },
        ]),
      },
    });
    expect(await db.application.count()).toBe(1);
  });

  it('persists manual review when the customer is a PEP on a large application', async () => {
    const result = await createApplication(db, {
      customerId: 'cust-haapala',
      actor: 'team-test',
      assetId: 'farm-002',
      date: '2026-11-05',
      downPaymentCents: 2_000_000,
      termMonths: 48,
      answers: {
        q_customer_type: 'company',
        q_email: 'office@haapala.example.com',
        q_business_id: '2876543-5',
        q_company_name: 'Haapalan Tila Oy',
        q_can_sign: 'yes',
        q_vat_registered: 'yes',
        q_farm_registry: 'FI-FARM-002',
        q_annual_revenue: 95_000_000,
        q_beneficial_owners: ['Jussi Haapala (60 %)', 'Maria Haapala (40 %)'],
        q_pep: 'yes',
        q_pep_details: 'Beneficial owner is politically exposed',
      },
    });

    expect(result).toMatchObject({
      ok: true,
      application: {
        decision: 'manual_review',
        reasons: [{ code: 'pep_manual_review', questionId: 'q_pep' }],
      },
    });
  });

  it('rejects incomplete applications without writing data', async () => {
    const result = await createApplication(db, {
      ...completeSubmission,
      answers: {},
    });

    expect(result).toEqual({
      ok: false,
      reason: 'incomplete',
      missingQuestionIds: ['q_customer_type', 'q_email', 'q_usage_purpose'],
    });
    expect(await db.application.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('rejects an unknown customer without writing data', async () => {
    await expect(
      createApplication(db, { ...completeSubmission, customerId: 'missing' })
    ).resolves.toEqual({ ok: false, reason: 'customer_not_found' });
    expect(await db.application.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });

  it('rejects an answer type that does not match the customer', async () => {
    await expect(
      createApplication(db, {
        ...completeSubmission,
        answers: { ...completeConsumerAnswers, q_customer_type: 'company' },
      })
    ).resolves.toEqual({
      ok: false,
      reason: 'customer_type_mismatch',
      customerType: 'consumer',
      answerType: 'company',
    });
    expect(await db.application.count()).toBe(0);
  });

  it('does not write when the asset cannot be quoted', async () => {
    await db.asset.update({ where: { id: 'ebike-003' }, data: { status: 'reserved' } });

    await expect(createApplication(db, completeSubmission)).resolves.toEqual({
      ok: false,
      reason: 'asset_unavailable',
      status: 'reserved',
    });
    expect(await db.application.count()).toBe(0);
    expect(await db.auditLog.count()).toBe(0);
  });
});
