// Exercise the real CLI-generated migrations and their database constraints.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Prisma, PrismaClient } from '@/generated/prisma/client';
import { createTestDb } from '../../tests/helpers/test-db';
import { withAudit, type TransactionClient } from './audit';

let db: PrismaClient;
let cleanup: () => Promise<void>;
const terms = JSON.stringify({ monthlyNetCents: 10730, termMonths: 36 });

beforeAll(async () => {
  ({ db, cleanup } = await createTestDb());
});

afterAll(async () => {
  await cleanup();
});

function change<T>(work: (tx: TransactionClient) => Promise<T>): Promise<T> {
  return withAudit(
    db,
    { actor: 'storage-test', action: 'storage.changed', entityType: 'fixture', entityId: 'spine' },
    work
  );
}

function contract(key: string, overrides: Partial<Prisma.ContractUncheckedCreateInput> = {}) {
  return {
    id: `contract-${key}`,
    quote_id: `quote-${key}`,
    application_id: `application-${key}`,
    customer_id: 'customer-a',
    asset_id: 'asset-a',
    life_number: key === 'first' ? 1 : 2,
    signed_on: '2026-11-05',
    start_date: '2026-11-05',
    end_date: '2029-11-05',
    terms_json: terms,
    ...overrides,
  };
}

const invoice = {
  id: 'invoice-first',
  contract_id: 'contract-first',
  kind: 'rent',
  period: 1,
  scheduled_for: '2026-11-05',
  invoice_date: '2026-11-05',
  due_date: '2026-11-05',
  net_cents: 10730,
  vat_basis_points: 2550,
  vat_cents: 2736,
  gross_cents: 13466,
};

beforeEach(async () => {
  await change(async (tx) => {
    await tx.assetLease.deleteMany();
    await tx.invoice.deleteMany();
    await tx.contract.deleteMany();
    await tx.application.deleteMany();
    await tx.quote.deleteMany();
    await tx.assetRelease.deleteMany();
    await tx.asset.deleteMany();
    await tx.auditLog.deleteMany();
    for (const id of ['asset-a', 'asset-b']) {
      await tx.asset.create({
        data: {
          id,
          category: 'e_bike',
          make: 'Synthetic',
          model: 'Storage test',
          model_year: 2026,
          serial_number: `serial-${id}`,
          condition: 'good',
          usage_unit: 'km',
          usage_value: 0,
          previous_lives: 0,
          status: 'available',
        },
      });
    }
    for (const key of ['first', 'second']) {
      await tx.quote.create({
        data: {
          id: `quote-${key}`,
          customer_id: 'customer-a',
          asset_id: 'asset-a',
          priced_on: '2026-11-05',
          start_date: '2026-11-05',
          valid_through: '2026-11-05',
          release_revision: 0,
          price_source: 'catalogue',
          terms_json: terms,
        },
      });
      await tx.application.create({
        data: {
          id: `application-${key}`,
          quote_id: `quote-${key}`,
          customer_id: 'customer-a',
          submitted_on: '2026-11-05',
          request_hash: `hash-${key}`,
          answers_json: '{}',
          decision: 'approved',
          reasons_json: '[]',
        },
      });
    }
    await tx.contract.create({ data: contract('first') });
  });
});

describe('persisted spine records', () => {
  it('round-trips snapshots, issued amounts, preparation and related records', async () => {
    await change(async (tx) => {
      await tx.invoice.create({ data: invoice });
      await tx.assetLease.create({ data: { asset_id: 'asset-a', contract_id: 'contract-first' } });
      await tx.assetRelease.create({
        data: {
          asset_id: 'asset-a',
          revision: 1,
          readiness_json: '{"tasks":[]}',
          relist_request_id: 'relist-first',
          relist_request_hash: 'relist-hash',
        },
      });
    });
    const saved = await db.contract.findUniqueOrThrow({
      where: { id: 'contract-first' },
      include: {
        quote: { include: { applications: true } },
        application: true,
        invoices: true,
        active_lease: true,
        asset: { include: { release: true } },
      },
    });
    expect(saved.status).toBe('active');
    expect(saved.terms_json).toBe(terms);
    expect(saved.quote.terms_json).toBe(terms);
    expect(saved.quote.applications.map((application) => application.id)).toEqual([
      'application-first',
    ]);
    expect(saved.application.request_hash).toBe('hash-first');
    expect(saved.invoices).toMatchObject([invoice]);
    expect(saved.active_lease?.asset_id).toBe('asset-a');
    expect(saved.asset.release).toMatchObject({
      revision: 1,
      net_price_cents: null,
      ready_on: null,
      relist_request_hash: 'relist-hash',
      readiness_json: '{"tasks":[]}',
    });
    expect(saved.close_request_hash).toBeNull();
  });

  it('rejects a second current lease and rolls back its new contract and audit entry', async () => {
    await change((tx) =>
      tx.assetLease.create({ data: { asset_id: 'asset-a', contract_id: 'contract-first' } })
    );
    const auditCount = await db.auditLog.count();
    await expect(
      change(async (tx) => {
        await tx.contract.create({ data: contract('second') });
        await tx.assetLease.create({
          data: { asset_id: 'asset-a', contract_id: 'contract-second' },
        });
      })
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.contract.findUnique({ where: { id: 'contract-second' } })).toBeNull();
    expect(await db.assetLease.count()).toBe(1);
    expect(await db.auditLog.count()).toBe(auditCount);
  });

  it('does not allocate one contract to two physical assets', async () => {
    await change((tx) =>
      tx.assetLease.create({ data: { asset_id: 'asset-a', contract_id: 'contract-first' } })
    );
    await expect(
      change((tx) =>
        tx.assetLease.create({ data: { asset_id: 'asset-b', contract_id: 'contract-first' } })
      )
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.assetLease.count()).toBe(1);
  });

  it.each([
    { quote_id: 'quote-first' },
    { application_id: 'application-first' },
    { life_number: 1 },
  ])('prevents duplicate contract evidence or asset life: %o', async (overrides) => {
    await expect(
      change((tx) => tx.contract.create({ data: contract('second', overrides) }))
    ).rejects.toMatchObject({ code: 'P2002' });
    expect(await db.contract.count()).toBe(1);
  });

  it('allows distinct invoice kinds and periods but never duplicates an issued period', async () => {
    await change((tx) => tx.invoice.create({ data: invoice }));
    await expect(
      change((tx) => tx.invoice.create({ data: { ...invoice, id: 'duplicate', gross_cents: 1 } }))
    ).rejects.toMatchObject({ code: 'P2002' });
    await change(async (tx) => {
      await tx.invoice.create({ data: { ...invoice, id: 'period-two', period: 2 } });
      await tx.invoice.create({ data: { ...invoice, id: 'buyout', kind: 'buyout' } });
    });
    expect(await db.invoice.count()).toBe(3);
    expect(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject(
      invoice
    );
  });

  it('rejects records that reference a nonexistent parent', async () => {
    await expect(
      change((tx) => tx.invoice.create({ data: { ...invoice, contract_id: 'missing' } }))
    ).rejects.toMatchObject({ code: 'P2003' });
    await expect(
      change((tx) => tx.assetRelease.create({ data: { asset_id: 'missing', revision: 0 } }))
    ).rejects.toMatchObject({ code: 'P2003' });
    expect(await db.invoice.count()).toBe(0);
    expect(await db.assetRelease.count()).toBe(0);
  });

  it('keeps earlier contracts and invoices when the same asset starts another life', async () => {
    await change(async (tx) => {
      await tx.invoice.create({ data: invoice });
      await tx.assetLease.create({ data: { asset_id: 'asset-a', contract_id: 'contract-first' } });
    });
    await change(async (tx) => {
      await tx.contract.update({
        where: { id: 'contract-first' },
        data: {
          status: 'returned',
          closed_on: '2029-11-05',
          close_request_id: 'close-first',
          close_request_hash: 'close-hash',
        },
      });
      await tx.assetLease.delete({ where: { asset_id: 'asset-a' } });
      await tx.contract.create({ data: contract('second') });
      await tx.assetLease.create({ data: { asset_id: 'asset-a', contract_id: 'contract-second' } });
    });
    expect(await db.contract.count({ where: { asset_id: 'asset-a' } })).toBe(2);
    expect(await db.contract.findUniqueOrThrow({ where: { id: 'contract-first' } })).toMatchObject({
      status: 'returned',
      terms_json: terms,
      close_request_hash: 'close-hash',
    });
    expect(await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } })).toMatchObject(
      invoice
    );
    expect(await db.assetLease.findUniqueOrThrow({ where: { asset_id: 'asset-a' } })).toMatchObject(
      { contract_id: 'contract-second' }
    );
  });

  it('keeps closure and relisting request IDs unique', async () => {
    await change(async (tx) => {
      await tx.contract.update({
        where: { id: 'contract-first' },
        data: { close_request_id: 'close-once', close_request_hash: 'close-hash' },
      });
      await tx.assetRelease.create({
        data: {
          asset_id: 'asset-a',
          revision: 1,
          relist_request_id: 'relist-once',
          relist_request_hash: 'relist-hash',
        },
      });
    });
    await expect(
      change((tx) =>
        tx.contract.create({
          data: contract('second', {
            close_request_id: 'close-once',
            close_request_hash: 'different-hash',
          }),
        })
      )
    ).rejects.toMatchObject({ code: 'P2002' });
    await expect(
      change((tx) =>
        tx.assetRelease.create({
          data: {
            asset_id: 'asset-b',
            revision: 1,
            relist_request_id: 'relist-once',
            relist_request_hash: 'different-hash',
          },
        })
      )
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
