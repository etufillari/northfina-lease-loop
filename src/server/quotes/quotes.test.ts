import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { loadAssets } from '@/data/load';
import type { Asset } from '@/data/schemas';
import { createTestDb } from '../../../tests/helpers/test-db';
import { seedAssets } from '../assets/assets';
import { createQuote, type QuoteRequest } from './quotes';
import type { PrismaClient } from '../prisma-client';

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

const request: QuoteRequest = {
  assetId: 'ebike-003',
  date: '2026-11-05',
  downPaymentCents: 0,
  termMonths: 36,
};

describe('createQuote', () => {
  it('reads the current asset and returns a quote', async () => {
    await expect(createQuote(db, request)).resolves.toMatchObject({
      ok: true,
      quote: {
        asset: { id: 'ebike-003', status: 'available' },
        pricing: { monthlyNetRentCents: 10_730 },
        vatPreview: { monthlyGrossRentCents: 13_466 },
      },
    });
  });

  it('returns not found for an asset missing from the database', async () => {
    await expect(createQuote(db, { ...request, assetId: 'missing' })).resolves.toEqual({
      ok: false,
      reason: 'asset_not_found',
    });
  });

  it('rejects an asset whose current status is reserved', async () => {
    await db.asset.update({ where: { id: request.assetId }, data: { status: 'reserved' } });

    await expect(createQuote(db, request)).resolves.toEqual({
      ok: false,
      reason: 'asset_unavailable',
      status: 'reserved',
    });
  });

  it('does not change the asset or write an audit row', async () => {
    await createQuote(db, request);

    expect(await db.asset.findUniqueOrThrow({ where: { id: request.assetId } })).toMatchObject({
      status: 'available',
    });
    expect(await db.auditLog.count()).toBe(0);
  });
});
