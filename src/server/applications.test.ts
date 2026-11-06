import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDb } from '../../tests/helpers/test-db';
import { getApplication, getContract, signContract, submitApplication } from './applications';

describe('application and signed contract flow', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>;

  beforeAll(async () => {
    testDb = await createTestDb();
    await testDb.db.asset.create({
      data: {
        id: 'ebike-003',
        category: 'e_bike',
        make: 'Northfina',
        model: 'Loop',
        model_year: 2026,
        serial_number: 'test-ebike-003',
        condition: 'new',
        usage_unit: 'km',
        usage_value: 0,
        previous_lives: 0,
        status: 'available',
      },
    });
    await testDb.db.asset.create({
      data: {
        id: 'farm-002',
        category: 'farm_machine',
        make: 'Northfina',
        model: 'Field',
        model_year: 2026,
        serial_number: 'test-farm-002',
        condition: 'new',
        usage_unit: 'engine_hours',
        usage_value: 0,
        previous_lives: 0,
        status: 'available',
      },
    });
    await testDb.db.asset.create({
      data: {
        id: 'ebike-004',
        category: 'e_bike',
        make: 'Northfina',
        model: 'City',
        model_year: 2026,
        serial_number: 'test-ebike-004',
        condition: 'new',
        usage_unit: 'km',
        usage_value: 0,
        previous_lives: 0,
        status: 'available',
      },
    });
  });

  afterAll(async () => testDb.cleanup());

  it('persists an approved application, signs it atomically, and reloads locked terms', async () => {
    const application = await submitApplication(
      testDb.db,
      {
        applicationId: 'application-aino-1',
        customerId: 'cust-aino',
        assetId: 'ebike-003',
        startDate: '2026-11-05',
        termMonths: 36,
        downPaymentCents: 0,
        priceListVersion: 1,
        offerExpiresOn: '2026-11-06',
        actor: 'dev2',
      },
      new Date('2026-11-05T10:00:00.000Z')
    );
    expect(application.ok).toBe(true);
    if (!application.ok) return;
    expect(application.application.monthly_net_cents).toBe(10730);

    expect(
      await signContract(testDb.db, {
        applicationId: 'application-aino-1',
        contractId: 'contract-unauthorized',
        signerId: 'someone-else',
        signedAt: new Date('2026-11-05T10:04:00.000Z'),
        actor: 'dev2',
      })
    ).toEqual({ ok: false, reason: 'signing_authority_required' });

    const signed = await signContract(testDb.db, {
      applicationId: 'application-aino-1',
      contractId: 'contract-aino-1',
      signerId: 'cust-aino',
      signedAt: new Date('2026-11-05T10:05:00.000Z'),
      actor: 'dev2',
    });
    expect(signed.ok).toBe(true);
    if (!signed.ok) return;
    expect(signed.terms).toEqual({
      contractId: 'contract-aino-1',
      assetId: 'ebike-003',
      customerId: 'cust-aino',
      startDate: '2026-11-05',
      termMonths: 36,
      monthlyNetCents: 10730,
      paymentDueDays: 14,
    });
    expect((await getContract(testDb.db, 'contract-aino-1'))?.monthly_net_cents).toBe(10730);
    expect((await getApplication(testDb.db, 'application-aino-1'))?.signed_at).not.toBeNull();
    expect(await testDb.db.auditLog.count({ where: { action: 'contract.signed' } })).toBe(1);
  });

  it('rejects expired offers and prevents a second signing', async () => {
    const expired = await submitApplication(
      testDb.db,
      {
        applicationId: 'application-expired',
        customerId: 'cust-aino',
        assetId: 'farm-002',
        startDate: '2026-11-05',
        termMonths: 36,
        downPaymentCents: 0,
        offerExpiresOn: '2026-11-04',
        actor: 'dev2',
      },
      new Date('2026-11-05T10:00:00.000Z')
    );
    expect(expired).toEqual({ ok: false, reason: 'invalid_offer' });
    expect(
      await signContract(testDb.db, {
        applicationId: 'application-aino-1',
        contractId: 'contract-duplicate',
        signerId: 'cust-aino',
        signedAt: new Date('2026-11-05T10:06:00.000Z'),
        actor: 'dev2',
      })
    ).toEqual({ ok: false, reason: 'already_signed' });
  });

  it('approves and signs an application for the customer holding the reservation', async () => {
    await testDb.db.asset.update({
      where: { id: 'ebike-004' },
      data: {
        status: 'reserved',
        reserved_by: 'cust-aino',
        reserved_until: new Date('2026-11-05T10:15:00.000Z'),
      },
    });
    const application = await submitApplication(
      testDb.db,
      {
        applicationId: 'application-reserved-customer',
        customerId: 'cust-aino',
        assetId: 'ebike-004',
        startDate: '2026-11-05',
        termMonths: 12,
        downPaymentCents: 0,
        offerExpiresOn: '2026-11-06',
        actor: 'cust-aino',
      },
      new Date('2026-11-05T10:00:00.000Z')
    );
    expect(application.ok && application.application.status).toBe('APPROVED');
    if (!application.ok) return;

    const signed = await signContract(testDb.db, {
      applicationId: application.application.id,
      contractId: 'contract-reserved-customer',
      signerId: 'cust-aino',
      signedAt: new Date('2026-11-05T10:05:00.000Z'),
      actor: 'cust-aino',
    });
    expect(signed.ok).toBe(true);
    expect(await getContract(testDb.db, 'contract-reserved-customer')).not.toBeNull();
  });

  it('blocks manual-review and unauthorized applicants from signing', async () => {
    const manual = await submitApplication(
      testDb.db,
      {
        applicationId: 'application-pep',
        customerId: 'cust-haapala',
        assetId: 'farm-002',
        startDate: '2026-11-05',
        termMonths: 36,
        downPaymentCents: 0,
        offerExpiresOn: '2026-11-06',
        actor: 'dev2',
      },
      new Date('2026-11-05T10:00:00.000Z')
    );
    expect(manual.ok && manual.application.status).toBe('MANUAL_REVIEW');
    expect(
      await signContract(testDb.db, {
        applicationId: 'application-pep',
        signerId: 'cust-haapala',
        signedAt: new Date('2026-11-05T10:06:00.000Z'),
        actor: 'dev2',
      })
    ).toEqual({ ok: false, reason: 'not_approved' });
  });
});
